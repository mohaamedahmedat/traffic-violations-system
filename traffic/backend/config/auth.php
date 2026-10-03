<?php

function currentUser() {
    return $_SESSION['user'] ?? null;
}

/** ينهي الجلسة ويردّ 401 برسالة محدّدة. */
function endSession(string $message) {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
                  $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();

    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => $message]);
    exit;
}

function requireAuth() {
    $user = currentUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'يجب تسجيل الدخول']);
        exit;
    }

    /* الجلسة تحمل لقطة المستخدم لحظة الدخول. بلا هذا الفحص يظل
       الحساب المعطَّل عاملاً حتى يخرج صاحبه بنفسه — والتعطيل إجراء
       أمني يُفترض أن يسري فوراً. يُعاد التحقق عند كل طلب من:
       وجود الحساب، وتفعيله، وتفعيل قسمه، وثبات دوره وقسمه. */
    $pdo  = getConnection();
    $stmt = $pdo->prepare("
        SELECT u.user_id, u.role, u.department_id, u.is_active,
               d.is_active AS dept_active
        FROM Users u
        LEFT JOIN Departments d ON d.department_id = u.department_id
        WHERE u.user_id = :id
    ");
    $stmt->execute([':id' => $user['user_id']]);
    $live = $stmt->fetch();

    if (!$live)                      endSession('الحساب لم يعد موجوداً');
    if ((int)$live['is_active'] !== 1) endSession('تم تعطيل هذا الحساب');

    // القسم المعطَّل يُعطّل من يعمل تحته. مدير النظام بلا قسم فلا يسري عليه.
    if ($live['department_id'] !== null && (int)$live['dept_active'] !== 1) {
        endSession('تم تعطيل قسم هذا الحساب');
    }

    if ($live['role'] !== $user['role']) {
        endSession('تغيّرت صلاحيات الحساب — يرجى تسجيل الدخول من جديد');
    }

    // المقارنة فضفاضة عمداً: الجلسة قد تحمل "1" والقاعدة 1
    if ((string)$live['department_id'] !== (string)$user['department_id']) {
        endSession('تغيّر قسم الحساب — يرجى تسجيل الدخول من جديد');
    }

    return $user;
}

function requireRole(...$roles) {
    $user = requireAuth();
    if (!in_array($user['role'], $roles, true)) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'غير مصرح لك بهذا الإجراء']);
        exit;
    }
    return $user;
}
?>
