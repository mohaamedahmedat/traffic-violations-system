<?php
require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'طريقة غير مسموحة']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['username']) || empty($input['password'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم وكلمة المرور مطلوبان']);
    exit;
}

try {
    $pdo = getConnection();

    $stmt = $pdo->prepare("
        SELECT
            u.*,
            o.officer_id,
            o.employee_no,
            o.officer_name,
            o.officer_rank,
            o.officer_unit,
            d.department_id,
            d.department_name,
            d.license_section,
            d.traffic_chief,
            d.directorate,
            d.location AS department_location
        FROM Users u
        LEFT JOIN Officers o    ON u.user_id       = o.user_id
        LEFT JOIN Departments d ON u.department_id = d.department_id
        WHERE u.username = :username
          AND u.is_active = 1
          -- تعطيل القسم يمنع دخول تابعيه (مدير القسم والضباط ومراكز الدفع)
          AND (u.department_id IS NULL OR d.is_active = 1)
    ");
    $stmt->execute([':username' => $input['username']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($input['password'], $user['password'])) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم أو كلمة المرور غير صحيحة']);
        exit;
    }

    unset($user['password']);

    session_regenerate_id(true);
    $_SESSION['user'] = $user;

    echo json_encode([
        'status'  => 'success',
        'message' => 'تم تسجيل الدخول بنجاح',
        'user'    => $user
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
}
?>