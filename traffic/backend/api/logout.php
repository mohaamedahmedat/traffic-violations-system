<?php
require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
    exit;
}

$_SESSION = [];
session_destroy();

echo json_encode(['status' => 'success', 'message' => 'تم تسجيل الخروج بنجاح']);
?>
