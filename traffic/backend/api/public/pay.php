<?php
require_once '../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'طريقة غير مسموحة']);
    exit;
}

$input          = json_decode(file_get_contents('php://input'), true);
$issued_id      = $input['issued_id']      ?? null;
$payment_method = $input['payment_method'] ?? null;

/* الدفع النقدي يقتضي حضور السائق وتسليم المال لموظف، فلا معنى له
   عن بُعد. يبقى متاحاً لمركز الدفع وحده في payments/index.php. */
$allowedMethods = ['card', 'libyana', 'sadad'];

if (empty($issued_id) || !ctype_digit((string)$issued_id) || !in_array($payment_method, $allowedMethods, true)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'بيانات الدفع غير صالحة']);
    exit;
}

try {
    $pdo = getConnection();
    $pdo->beginTransaction();

    $stmtIssued = $pdo->prepare("SELECT issued_id, violation_status FROM IssuedViolations WHERE is_active = 1 AND issued_id = :id FOR UPDATE");
    $stmtIssued->execute([':id' => $issued_id]);
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

    // دفاع ثانٍ: وجود سجل دفع سابق رغم أن الحالة "معلّقة" يعني بيانات مختلّة —
    // نصحّح الحالة ونرفض بدل تسجيل دفعة ثانية.
    $dup = $pdo->prepare("SELECT payment_id FROM Payments WHERE issued_id = :id");
    $dup->execute([':id' => $issued_id]);
    if ($dup->fetch()) {
        $pdo->prepare("UPDATE IssuedViolations SET violation_status = 'paid' WHERE issued_id = :id")
            ->execute([':id' => $issued_id]);
        $pdo->commit();
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'هذه المخالفة مدفوعة مسبقاً']);
        exit;
    }

    $stmtAmount = $pdo->prepare("
        SELECT COALESCE(SUM(tv.fine_amount), 0)
        FROM TicketViolations tv
        WHERE tv.issued_id = :id
    ");
    $stmtAmount->execute([':id' => $issued_id]);
    $amount = $stmtAmount->fetchColumn();

    $stmt = $pdo->prepare("
        INSERT INTO Payments (issued_id, payment_method, amount, payment_date, payment_time, processed_by, payment_status)
        VALUES (:issued_id, :method, :amount, CURDATE(), CURTIME(), NULL, 'paid')
    ");
    $stmt->execute([
        ':issued_id' => $issued_id,
        ':method'    => $payment_method,
        ':amount'    => $amount,
    ]);

    $pdo->prepare("UPDATE IssuedViolations SET violation_status = 'paid' WHERE issued_id = :id")
        ->execute([':id' => $issued_id]);

    $pdo->commit();

    echo json_encode(['status' => 'success', 'message' => 'تم تسجيل الدفع بنجاح']);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
}
?>
