<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = requireRole('admin', 'payment_center');

switch ($method) {

    case 'GET':
        try {
            $pdo = getConnection();

            /* كان الاستعلام بلا أي شرط: حساب مركز دفع في طرابلس يرى
               كل دفعات البلاد. الحصر بقسم الضابط مُصدِر المخالفة —
               وهو نفس معيار الحصر في التقارير. */
            $scopeSql = '';
            $params   = [];
            if ($user['role'] !== 'admin') {
                if (empty($user['department_id'])) {
                    http_response_code(403);
                    echo json_encode(['status' => 'error', 'message' => 'الحساب غير مرتبط بقسم']);
                    exit;
                }
                $scopeSql = ' WHERE o.department_id = :dept_id';
                $params[':dept_id'] = $user['department_id'];
            }

            $stmt = $pdo->prepare("
                SELECT
                    p.*,
                    d.driver_name,
                    d.identity_card,
                    d.license_no,
                    d.license_class,
                    d.license_issue,
                    d.driver_job,
                    v.plate_no,
                    v.chassis_no,
                    v.vehicle_type,
                    o.officer_name,
                    o.officer_rank,
                    o.employee_no,
                    dp.department_name,
                    dp.license_section,
                    dp.traffic_chief,
                    dp.directorate,
                    iv.violation_status,
                    iv.issued_date,
                    iv.issued_time,
                    iv.location,
                    u.username AS processed_by_username
                FROM Payments p
                LEFT JOIN IssuedViolations iv ON p.issued_id     = iv.issued_id
                LEFT JOIN Drivers d           ON iv.driver_id    = d.driver_id
                LEFT JOIN Vehicles v          ON iv.vehicle_id   = v.vehicle_id
                LEFT JOIN Officers o          ON iv.officer_id   = o.officer_id
                LEFT JOIN Departments dp      ON o.department_id = dp.department_id
                LEFT JOIN Users u             ON p.processed_by  = u.user_id
                $scopeSql
            ");
            $stmt->execute($params);
            $data = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $data]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'POST':
        try {
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($input['issued_id']) || empty($input['payment_method'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'بيانات الدفع ناقصة']);
                exit;
            }

            if (!in_array($input['payment_method'], ['cash', 'card', 'libyana', 'sadad'], true)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'طريقة الدفع غير صالحة']);
                exit;
            }

            $pdo = getConnection();
            $pdo->beginTransaction();

            $stmtIssued = $pdo->prepare("
                SELECT
                    iv.issued_id,
                    iv.violation_status,
                    COALESCE((
                        SELECT SUM(tv.fine_amount)
                        FROM TicketViolations tv
                        WHERE tv.issued_id = iv.issued_id
                    ), 0) AS total_fine
                FROM IssuedViolations iv
                WHERE iv.is_active = 1 AND iv.issued_id = :id
                FOR UPDATE
            ");
            $stmtIssued->execute([':id' => $input['issued_id']]);
            $issued = $stmtIssued->fetch();

            if (!$issued) {
                $pdo->rollBack();
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'المخالفة غير موجودة']);
                exit;
            }

            if ($issued['violation_status'] === 'paid') {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'هذه المخالفة مدفوعة مسبقاً']);
                exit;
            }

            // دفاع ثانٍ: لو اختلّت الحالة عن سجل الدفع (بيانات قديمة مثلاً)
            // فالاعتماد على الحالة وحدها يسمح بدفعة مكررة.
            $dup = $pdo->prepare("SELECT payment_id FROM Payments WHERE issued_id = :id");
            $dup->execute([':id' => $input['issued_id']]);
            if ($dup->fetch()) {
                $pdo->prepare("UPDATE IssuedViolations SET violation_status = 'paid' WHERE issued_id = :id")
                    ->execute([':id' => $input['issued_id']]);
                $pdo->commit();
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'هذه المخالفة مدفوعة مسبقاً']);
                exit;
            }

            $stmt = $pdo->prepare("
                INSERT INTO Payments
                    (issued_id, payment_method, amount, payment_date, payment_time, processed_by, payment_status)
                VALUES
                    (:issued_id, :method, :amount, CURDATE(), CURTIME(), :processed_by, 'paid')
            ");
            $stmt->execute([
                ':issued_id'    => $input['issued_id'],
                ':method'       => $input['payment_method'],
                ':amount'       => $issued['total_fine'],
                ':processed_by' => $user['user_id'],
            ]);
            $payment_id = $pdo->lastInsertId();

            $pdo->prepare("UPDATE IssuedViolations SET violation_status = 'paid' WHERE issued_id = :id")
                ->execute([':id' => $input['issued_id']]);

            $pdo->commit();

            echo json_encode([
                'status'  => 'success',
                'message' => 'تم تسجيل الدفع بنجاح',
                'id'      => $payment_id
            ]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;
}
?>
