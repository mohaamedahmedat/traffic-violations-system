<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = requireRole('department_admin');

switch ($method) {

    case 'GET':
        try {
            $pdo  = getConnection();
            $stmt = $pdo->prepare("
                SELECT o.*, d.department_name, d.license_section, d.traffic_chief, d.directorate,
                       u.username, u.role, u.is_active
                FROM Officers o
                LEFT JOIN Departments d ON o.department_id = d.department_id
                LEFT JOIN Users u       ON o.user_id       = u.user_id
                WHERE o.department_id = :department_id
            ");
            $stmt->execute([':department_id' => $user['department_id']]);
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

            if (empty($input['officer_name']) || empty($input['username']) || empty($input['password'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'يرجى تعبئة الاسم واسم المستخدم وكلمة المرور']);
                exit;
            }

            $role = in_array($input['role'] ?? null, ['officer', 'payment_center'], true)
                ? $input['role']
                : 'officer';

            $pdo = getConnection();
            $pdo->beginTransaction();

            $check = $pdo->prepare("SELECT user_id FROM Users WHERE username = :username");
            $check->execute([':username' => $input['username']]);
            if ($check->fetch()) {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم مستخدم مسبقاً']);
                exit;
            }

            $hashed = password_hash($input['password'], PASSWORD_BCRYPT);

            $stmtUser = $pdo->prepare("
                INSERT INTO Users (username, password, role, department_id, is_active)
                VALUES (:username, :password, :role, :department_id, 1)
            ");
            $stmtUser->execute([
                ':username'      => $input['username'],
                ':password'      => $hashed,
                ':role'          => $role,
                ':department_id' => $user['department_id'],
            ]);
            $user_id = $pdo->lastInsertId();

            $stmtOfficer = $pdo->prepare("
                INSERT INTO Officers (employee_no, officer_name, officer_rank, officer_unit, department_id, user_id)
                VALUES (:employee_no, :officer_name, :officer_rank, :officer_unit, :department_id, :user_id)
            ");
            $stmtOfficer->execute([
                ':employee_no'   => $input['employee_no']  ?? null,
                ':officer_name'  => $input['officer_name'],
                ':officer_rank'  => $input['officer_rank'] ?? null,
                ':officer_unit'  => $input['officer_unit'] ?? null,
                ':department_id' => $user['department_id'],
                ':user_id'       => $user_id,
            ]);
            $officer_id = $pdo->lastInsertId();

            $pdo->commit();

            echo json_encode([
                'status'  => 'success',
                'message' => 'تمت إضافة الضابط وإنشاء حسابه بنجاح',
                'id'      => $officer_id
            ]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    /* تعديل شامل: كل حقول الضابط + بيانات حسابه
       (نفس الحقول المتاحة في نموذج الإضافة) */
    case 'PUT':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = $input['officer_id'] ?? null;
            $pdo   = getConnection();

            if (empty($id)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'معرف الضابط مطلوب']);
                exit;
            }

            // ملكية القسم — يمنع تعديل ضباط قسم آخر
            $owns = $pdo->prepare("SELECT user_id FROM Officers WHERE officer_id = :id AND department_id = :department_id");
            $owns->execute([':id' => $id, ':department_id' => $user['department_id']]);
            $row = $owns->fetch();
            if (!$row) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'غير مصرح لك بتعديل هذا الضابط']);
                exit;
            }
            $officerUserId = $row['user_id'];

            if (empty(trim((string)($input['officer_name'] ?? '')))) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'اسم الضابط مطلوب']);
                exit;
            }

            $newUsername = trim((string)($input['username'] ?? ''));
            $newPassword = (string)($input['password'] ?? '');
            $newRole     = $input['role'] ?? null;

            if ($newRole !== null && $newRole !== '' && !in_array($newRole, ['officer', 'payment_center'], true)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'دور غير صالح']);
                exit;
            }

            // تفرّد اسم المستخدم قبل أي كتابة
            if ($newUsername !== '') {
                $dup = $pdo->prepare("SELECT user_id FROM Users WHERE username = :username AND user_id <> :uid");
                $dup->execute([':username' => $newUsername, ':uid' => $officerUserId ?: 0]);
                if ($dup->fetch()) {
                    http_response_code(409);
                    echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم مستخدم مسبقاً']);
                    exit;
                }
            }

            $pdo->beginTransaction();

            $pdo->prepare("
                UPDATE Officers SET
                    employee_no   = :employee_no,
                    officer_name  = :officer_name,
                    officer_rank  = :officer_rank,
                    officer_unit  = :officer_unit
                WHERE officer_id = :id
            ")->execute([
                ':employee_no'  => $input['employee_no']  ?? null,
                ':officer_name' => trim($input['officer_name']),
                ':officer_rank' => $input['officer_rank'] ?? null,
                ':officer_unit' => $input['officer_unit'] ?? null,
                ':id'           => $id,
            ]);

            // الحساب المرتبط — الحقول المُرسَلة فقط
            if ($officerUserId) {
                $sets   = [];
                $params = [':uid' => $officerUserId];
                if ($newUsername !== '') { $sets[] = 'username = :username'; $params[':username'] = $newUsername; }
                if ($newPassword !== '') { $sets[] = 'password = :password'; $params[':password'] = password_hash($newPassword, PASSWORD_BCRYPT); }
                if ($newRole)            { $sets[] = 'role = :role';         $params[':role']     = $newRole; }
                if ($sets) {
                    $pdo->prepare('UPDATE Users SET ' . implode(', ', $sets) . ' WHERE user_id = :uid')
                        ->execute($params);
                }
            }

            $pdo->commit();
            echo json_encode(['status' => 'success', 'message' => 'تم التعديل بنجاح']);
        } catch (PDOException $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'طريقة غير مسموحة']);
}
?>
