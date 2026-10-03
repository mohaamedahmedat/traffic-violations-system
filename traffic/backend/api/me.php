<?php
require_once '../config/database.php';
require_once '../config/auth.php';

$user = currentUser();

if (!$user) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'لا توجد جلسة نشطة']);
    exit;
}

echo json_encode(['status' => 'success', 'user' => $user]);
?>
