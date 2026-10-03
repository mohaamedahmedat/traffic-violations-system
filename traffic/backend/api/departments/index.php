<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

requireRole('admin');

switch ($method) {

    case 'GET':
        try {
            $pdo  = getConnection();
            // اسم مستخدم مدير القسم يُعرض في جدول الأقسام ويُملأ في نموذج التعديل
            $stmt = $pdo->query("
                SELECT d.*,
                       u.user_id  AS admin_user_id,
                       u.username AS admin_username,
                       u.is_active AS admin_is_active
                FROM Departments d
                LEFT JOIN Users u
                       ON u.department_id = d.department_id
                      AND u.role = 'department_admin'
                ORDER BY d.department_id
            ");
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

            if (empty($input['department_name']) || empty($input['username']) || empty($input['password'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'يرجى تعبئة اسم القسم واسم المستخدم وكلمة المرور']);
                exit;
            }

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

            $stmtDept = $pdo->prepare("
                INSERT INTO Departments (department_name, license_section, traffic_chief, directorate, location, is_active)
                VALUES (:department_name, :license_section, :traffic_chief, :directorate, :location, 1)
            ");
            $stmtDept->execute([
                ':department_name' => $input['department_name'] ?? null,
                ':license_section' => $input['license_section'] ?? null,
                ':traffic_chief'   => $input['traffic_chief']   ?? null,
                ':directorate'     => $input['directorate']     ?? null,
                ':location'        => $input['location']        ?? null,
            ]);
            $department_id = $pdo->lastInsertId();

            $hashed = password_hash($input['password'], PASSWORD_BCRYPT);
            $stmtUser = $pdo->prepare("
                INSERT INTO Users (username, password, role, department_id, is_active)
                VALUES (:username, :password, 'department_admin', :department_id, 1)
            ");
            $stmtUser->execute([
                ':username'      => $input['username'],
                ':password'      => $hashed,
                ':department_id' => $department_id,
            ]);

            $pdo->commit();

            echo json_encode([
                'status'  => 'success',
                'message' => 'تم إنشاء القسم وحساب المدير بنجاح',
                'id'      => $department_id
            ]);
        } catch (PDOException $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    /* تعديل شامل: كل حقول القسم + بيانات حساب مديره
       (نفس الحقول المتاحة في نموذج الإنشاء) */
    case 'PUT':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = $input['department_id'] ?? null;

            if (empty($id)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'معرف القسم مطلوب']);
                exit;
            }

            if (empty($input['department_name'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'اسم القسم مطلوب']);
                exit;
            }

            $pdo = getConnection();

            $exists = $pdo->prepare("SELECT department_id FROM Departments WHERE department_id = :id");
            $exists->execute([':id' => $id]);
            if (!$exists->fetch()) {
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'القسم غير موجود']);
                exit;
            }

            // حساب مدير القسم المرتبط (إن وُجد)
            $adminStmt = $pdo->prepare("
                SELECT user_id FROM Users
                WHERE department_id = :id AND role = 'department_admin'
                ORDER BY user_id LIMIT 1
            ");
            $adminStmt->execute([':id' => $id]);
            $adminId = $adminStmt->fetchColumn();

            $newUsername = trim((string)($input['username'] ?? ''));
            $newPassword = (string)($input['password'] ?? '');

            // التحقق من تفرّد اسم المستخدم قبل أي كتابة
            if ($newUsername !== '') {
                $dup = $pdo->prepare("SELECT user_id FROM Users WHERE username = :username AND user_id <> :uid");
                $dup->execute([':username' => $newUsername, ':uid' => $adminId ?: 0]);
                if ($dup->fetch()) {
                    http_response_code(409);
                    echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم مستخدم مسبقاً']);
                    exit;
                }
            }

            $pdo->beginTransaction();

            /* الحقول المرسَلة وحدها — كما في PUT للمخالفة الصادرة.
               الصيغة السابقة تكتب الخمسة دائماً، فطلب يحمل الاسم وحده
               يمسح قسم الترخيص ورئيس القسم والمديرية والموقع بـNULL.
               اسم القسم إلزامي ومفحوص أعلاه، فيُكتب دائماً. */
            $sets   = ['department_name = :department_name'];
            $params = [':department_name' => $input['department_name'], ':id' => $id];

            foreach (['license_section', 'traffic_chief', 'directorate', 'location'] as $col) {
                if (array_key_exists($col, $input)) {
                    $sets[] = "$col = :$col";
                    $params[":$col"] = $input[$col];
                }
            }

            $pdo->prepare('UPDATE Departments SET ' . implode(', ', $sets) . ' WHERE department_id = :id')
                ->execute($params);

            // تحديث حساب المدير — الحقول المُرسَلة فقط
            if ($adminId) {
                $sets   = [];
                $params = [':uid' => $adminId];
                if ($newUsername !== '') {
                    $sets[] = 'username = :username';
                    $params[':username'] = $newUsername;
                }
                if ($newPassword !== '') {
                    $sets[] = 'password = :password';
                    $params[':password'] = password_hash($newPassword, PASSWORD_BCRYPT);
                }
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

    /* تنشيط / إلغاء تنشيط — بديل الحذف.
       لا يُمسّ أي سجل: القسم يبقى وتبقى علاقاته بالضباط والمخالفات سليمة،
       ويُمنع تابعوه من الدخول فقط. */
    case 'PATCH':
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $id    = $input['department_id'] ?? null;

            if (empty($id) || !isset($input['is_active'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'معرف القسم والحالة مطلوبان']);
                exit;
            }

            $active = (int)$input['is_active'] === 1 ? 1 : 0;

            $pdo = getConnection();

            $exists = $pdo->prepare("SELECT department_id FROM Departments WHERE department_id = :id");
            $exists->execute([':id' => $id]);
            if (!$exists->fetch()) {
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'القسم غير موجود']);
                exit;
            }

            $pdo->beginTransaction();

            $pdo->prepare("UPDATE Departments SET is_active = :a WHERE department_id = :id")
                ->execute([':a' => $active, ':id' => $id]);

            /* العلامة deactivated_by_dept تفصل سببَي التعطيل.
               الحساب الذي عطّله مدير القسم عمداً كان يُفعَّل مع القسم،
               فيعود منفذ دخول أُغلق بقرار — وهو ما يمنعه هذا التمييز.

               عند الإلغاء: يُعلَّم من كان نشطاً وحده، فهو من عُطِّل بسبب
               القسم. من كان معطَّلاً أصلاً يبقى بعلامة 0.
               عند التنشيط: يُفعَّل ذوو العلامة 1 وحدهم، ثم تُمسح. */
            if ($active) {
                $affected = $pdo->prepare("
                    UPDATE Users SET is_active = 1, deactivated_by_dept = 0
                    WHERE department_id = :id AND deactivated_by_dept = 1
                ");
                $affected->execute([':id' => $id]);
                $count = $affected->rowCount();

                $kept = $pdo->prepare("
                    SELECT COUNT(*) FROM Users
                    WHERE department_id = :id AND is_active = 0
                ");
                $kept->execute([':id' => $id]);
                $keptCount = (int)$kept->fetchColumn();

                $msg = "تم تنشيط القسم و{$count} حساباً";
                if ($keptCount > 0) {
                    $msg .= " — و{$keptCount} حساباً بقي معطَّلاً لأنه عُطِّل بقرار مستقل";
                }
            } else {
                $affected = $pdo->prepare("
                    UPDATE Users SET is_active = 0, deactivated_by_dept = 1
                    WHERE department_id = :id AND is_active = 1
                ");
                $affected->execute([':id' => $id]);
                $count = $affected->rowCount();
                $msg = "تم إلغاء تنشيط القسم و{$count} حساباً";
            }

            $pdo->commit();

            echo json_encode(['status' => 'success', 'message' => $msg]);
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
