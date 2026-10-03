<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

requireAuth();

switch ($method) {

    case 'GET':
        try {
            $pdo  = getConnection();
            $stmt = $pdo->query("SELECT * FROM Violations");
            $data = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $data]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'POST':
        requireRole('admin');
        try {
            $input = json_decode(file_get_contents('php://input'), true);

            $fine = $input['fine_amount'] ?? null;
            if (empty($input['violation_article']) || !is_numeric($fine) || (float)$fine <= 0) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'المادة القانونية وقيمة الغرامة (أكبر من صفر) مطلوبتان']);
                exit;
            }

            $pdo   = getConnection();
            $stmt  = $pdo->prepare("
                INSERT INTO Violations (violation_article, violation_description, fine_amount)
                VALUES (:article, :description, :fine_amount)
            ");
            $stmt->execute([
                ':article'     => $input['violation_article']     ?? null,
                ':description' => $input['violation_description'] ?? null,
                ':fine_amount' => (float)$fine,
            ]);
            echo json_encode([
                'status'  => 'success',
                'message' => 'تمت إضافة المخالفة بنجاح',
                'id'      => $pdo->lastInsertId()
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'PUT':
        requireRole('admin');
        try {
            $input = json_decode(file_get_contents('php://input'), true);

            $id   = $input['violation_id'] ?? null;
            $fine = $input['fine_amount']  ?? null;
            if (empty($id) || empty($input['violation_article']) || !is_numeric($fine) || (float)$fine <= 0) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'بيانات المخالفة غير مكتملة أو غير صحيحة']);
                exit;
            }

            $pdo   = getConnection();
            $stmt  = $pdo->prepare("
                UPDATE Violations SET
                    violation_article     = :article,
                    violation_description = :description,
                    fine_amount           = :fine_amount
                WHERE violation_id = :id
            ");
            $stmt->execute([
                ':article'     => $input['violation_article']     ?? null,
                ':description' => $input['violation_description'] ?? null,
                ':fine_amount' => (float)$fine,
                ':id'          => $id,
            ]);
            echo json_encode(['status' => 'success', 'message' => 'تم التعديل بنجاح']);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'DELETE':
        requireRole('admin');
        try {
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($input['violation_id'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'معرف المخالفة مطلوب']);
                exit;
            }

            $pdo   = getConnection();

            $inUse = $pdo->prepare("SELECT issued_id FROM TicketViolations WHERE violation_id = :id LIMIT 1");
            $inUse->execute([':id' => $input['violation_id'] ?? null]);
            if ($inUse->fetch()) {
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'لا يمكن حذف هذه المخالفة لوجود مخالفات صادرة مرتبطة بها']);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM Violations WHERE violation_id = :id");
            $stmt->execute([':id' => $input['violation_id'] ?? null]);
            echo json_encode(['status' => 'success', 'message' => 'تم الحذف بنجاح']);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;
}
?>
