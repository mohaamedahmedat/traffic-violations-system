<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = requireRole('admin', 'department_admin');

/* الأدوار التي لا معنى لها خارج قسم */
const DEPARTMENT_BOUND_ROLES = ['department_admin', 'payment_center'];

/**
 * يتحقّق من القسم بحسب الدور ويُرجع القيمة الصالحة للتخزين.
 * يُنهي الطلب بـ400 إن خالف — ولا يترك قيد المفتاح الأجنبي يرفع
 * الأمر إلى 500 غامض كما كان يحدث مع رقم قسم غير موجود.
 */
function requireDepartmentFor(PDO $pdo, ?string $role, $raw) {
    $deptId = ($raw === '' || $raw === null) ? null : (int)$raw;

    if (!in_array($role, DEPARTMENT_BOUND_ROLES, true)) {
        // مدير النظام فوق الأقسام — لا يُنسب إلى واحد
        return $role === 'admin' ? null : $deptId;
    }

    if ($deptId === null) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'يجب اختيار القسم لحسابات مدير القسم ومركز الدفع']);
        exit;
    }

    $q = $pdo->prepare("SELECT is_active FROM Departments WHERE department_id = :id");
    $q->execute([':id' => $deptId]);
    $dept = $q->fetch();

    if (!$dept) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'القسم المحدَّد غير موجود']);
        exit;
    }
    if ((int)$dept['is_active'] !== 1) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'لا يمكن ربط حساب بقسم غير مفعَّل']);
        exit;
    }
    return $deptId;
}

switch ($method) {

    case 'GET':
        if ($user['role'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'غير مصرح لك بهذا الإجراء']);
            exit;
        }
        try {
            $pdo  = getConnection();
            $stmt = $pdo->query("
                SELECT u.user_id, u.username, u.role, u.department_id, u.is_active,
                       o.officer_id, o.officer_name, o.officer_rank, o.employee_no,
                       d.department_name, d.license_section, d.traffic_chief, d.directorate
                FROM Users u
                LEFT JOIN Officers o    ON u.user_id       = o.user_id
                LEFT JOIN Departments d ON u.department_id = d.department_id
            ");
            $data = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $data]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'POST':
        if ($user['role'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'غير مصرح لك بهذا الإجراء']);
            exit;
        }
        try {
            $input    = json_decode(file_get_contents('php://input'), true);
            $role     = $input['role'] ?? null;
            $username = trim((string)($input['username'] ?? ''));
            $password = (string)($input['password'] ?? '');

            /* القاعدة الحاكمة: لا يُنشأ حساب إلا ومعه كل ما يلزم دوره
               ليعمل فعلاً. الحساب الناقص يدخل النظام ثم يجد لوحة فارغة
               بلا تفسير، أو يُرفض بـ403 عند أول إجراء — أي يُولد معطوباً.

               'officer' مستبعَد عمداً: رجل المرور يحتاج صفاً في Officers
               ليُنسَب إليه ما يُصدره، وإنشاؤه هنا ينتج حساباً بلا سجل
               فتصير مخالفاته بلا ضابط وتختفي من تقارير قسمه.
               مساره الوحيد officers/index.php الذي ينشئ الصفّين معاً. */
            if (!in_array($role, ['admin', 'department_admin', 'payment_center'], true)) {
                http_response_code(400);
                $msg = $role === 'officer'
                    ? 'رجل المرور يُنشأ من إدارة الضباط في لوحة مدير القسم، لا من هنا'
                    : 'دور غير صالح';
                echo json_encode(['status' => 'error', 'message' => $msg]);
                exit;
            }

            if ($username === '' || $password === '') {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم وكلمة المرور مطلوبان']);
                exit;
            }

            /* حدٌّ أدنى ثمانية محارف. الرقم ليس اعتباطياً: أقصر منه
               يُخمَّن في زمن معقول، وأطول منه يدفع المستخدمين إلى
               كتابته على ورقة. وهو يسري على الإنشاء لا على الحسابات
               القائمة، فبذرة العرض لا تُكسر. */
            if (mb_strlen($password) < 8) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'كلمة المرور يجب ألا تقل عن ثمانية محارف']);
                exit;
            }

            $pdo = getConnection();

            /* مدير النظام فوق الأقسام ولا يُنسب إلى واحد.
               والدوران الآخران يعملان داخل قسم فيلزمهما قسم مفعَّل. */
            $deptId = requireDepartmentFor($pdo, $role, $input['department_id'] ?? null);

            /* لكل قسم مدير واحد. الثاني يرى اللوحة نفسها ويُدير الضباط
               أنفسهم، فيتضارب القراران على سجل واحد بلا أثر يبيّن أيّهما
               فعل. والرسالة تذكر اسم المدير الحالي حتى يعرف مدير النظام
               مَن يُعطّل إن أراد الاستبدال. */
            if ($role === 'department_admin') {
                $owner = $pdo->prepare("
                    SELECT username FROM Users
                    WHERE role = 'department_admin' AND department_id = :d AND is_active = 1
                    LIMIT 1
                ");
                $owner->execute([':d' => $deptId]);
                if ($existing = $owner->fetch()) {
                    http_response_code(409);
                    echo json_encode([
                        'status'  => 'error',
                        'message' => 'هذا القسم له مدير بالفعل: ' . $existing['username']
                                   . ' — عطّل حسابه أولاً إن أردت استبداله'
                    ]);
                    exit;
                }
            }

            /* موظف مركز الدفع يُنشأ بسجلّه كما يُنشأ رجل المرور تماماً:
               الاسم الكامل يظهر على إيصال استلام النقود، وبدونه يخرج
               الإيصال باسم حساب بريدي لا باسم موظف. */
            $officerName = trim((string)($input['officer_name'] ?? ''));
            if ($role === 'payment_center' && $officerName === '') {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'الاسم الكامل مطلوب لحساب موظف مركز الدفع']);
                exit;
            }

            $check = $pdo->prepare("SELECT user_id FROM Users WHERE username = :username");
            $check->execute([':username' => $username]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم «' . $username . '» مستخدم مسبقاً']);
                exit;
            }

            /* الحساب وسجلّه في معاملة واحدة: إن فشل أحدهما لا يُنشأ
               الآخر، فلا يبقى حساب مركز دفع بلا سجل ولا سجلّ بلا حساب. */
            $pdo->beginTransaction();

            $hashed = password_hash($password, PASSWORD_BCRYPT);
            $stmt   = $pdo->prepare("
                INSERT INTO Users (username, password, role, department_id, is_active)
                VALUES (:username, :password, :role, :department_id, 1)
            ");
            $stmt->execute([
                ':username'      => $username,
                ':password'      => $hashed,
                ':role'          => $role,
                ':department_id' => $deptId,
            ]);
            $newId = $pdo->lastInsertId();

            if ($role === 'payment_center') {
                $pdo->prepare("
                    INSERT INTO Officers (employee_no, officer_name, officer_rank, officer_unit, department_id, user_id)
                    VALUES (:no, :name, :rank, :unit, :dept, :uid)
                ")->execute([
                    ':no'   => ($input['employee_no']  ?? '') !== '' ? $input['employee_no']  : null,
                    ':name' => $officerName,
                    ':rank' => ($input['officer_rank'] ?? '') !== '' ? $input['officer_rank'] : null,
                    ':unit' => ($input['officer_unit'] ?? '') !== '' ? $input['officer_unit'] : 'مركز الدفع',
                    ':dept' => $deptId,
                    ':uid'  => $newId,
                ]);
            }

            $pdo->commit();

            echo json_encode([
                'status'  => 'success',
                'message' => 'تم إنشاء الحساب بنجاح',
                'id'      => $newId
            ]);
        } catch (PDOException $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'PUT':
        try {
            $input   = json_decode(file_get_contents('php://input'), true);
            $pdo     = getConnection();
            $user_id = $input['user_id'] ?? null;

            if (empty($user_id)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'معرف المستخدم مطلوب']);
                exit;
            }

            if ($user['role'] === 'admin') {
                /* الترقية إلى 'officer' ممنوعة للسبب نفسه: الحساب سيبقى
                   بلا صف في Officers مهما تغيّر دوره. */
                if (!empty($input['role']) && !in_array($input['role'], ['admin', 'department_admin', 'payment_center'], true)) {
                    http_response_code(400);
                    $msg = $input['role'] === 'officer'
                        ? 'لا يمكن تحويل حساب إلى رجل مرور — يُنشأ من إدارة الضباط في لوحة مدير القسم'
                        : 'دور غير صالح';
                    echo json_encode(['status' => 'error', 'message' => $msg]);
                    exit;
                }

                // منع المدير من تعطيل نفسه أو تغيير دوره — يؤدي لقفل النظام
                if ((int)$user_id === (int)$user['user_id']) {
                    $losesAdmin = (isset($input['role']) && $input['role'] !== 'admin')
                               || (isset($input['is_active']) && (int)$input['is_active'] === 0);
                    if ($losesAdmin) {
                        http_response_code(409);
                        echo json_encode(['status' => 'error', 'message' => 'لا يمكنك تعطيل حسابك أو تغيير دورك']);
                        exit;
                    }
                }

                $exists = $pdo->prepare("SELECT user_id, role, department_id FROM Users WHERE user_id = :id");
                $exists->execute([':id' => $user_id]);
                $current = $exists->fetch();
                if (!$current) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'المستخدم غير موجود']);
                    exit;
                }

                /* القاعدة نفسها تسري على التعديل: لا يُجرَّد حساب مقيَّد
                   بقسم من قسمه، ولا يُحوَّل حساب إلى دور مقيَّد بلا قسم.
                   الدور الفعّال هو المُرسَل إن وُجد، وإلا الدور الحالي. */
                $effectiveRole = !empty($input['role']) ? $input['role'] : $current['role'];
                $rawDept = array_key_exists('department_id', $input)
                    ? $input['department_id']
                    : $current['department_id'];
                $checkedDept = requireDepartmentFor($pdo, $effectiveRole, $rawDept);

                /* تغيير الدور إلى مقيَّد بقسم يستلزم كتابة القسم حتى لو لم
                   يُرسَل — وإلا بقي NULL من الحالة السابقة. */
                if (!array_key_exists('department_id', $input)
                    && in_array($effectiveRole, DEPARTMENT_BOUND_ROLES, true)) {
                    $input['department_id'] = $checkedDept;
                }

                // تحديث الحقول المُرسَلة فقط — الإرسال الجزئي كان يمسح بقية الأعمدة
                $sets   = [];
                $params = [':id' => $user_id];

                if (array_key_exists('username', $input) && $input['username'] !== '') {
                    $dup = $pdo->prepare("SELECT user_id FROM Users WHERE username = :username AND user_id <> :id");
                    $dup->execute([':username' => $input['username'], ':id' => $user_id]);
                    if ($dup->fetch()) {
                        http_response_code(409);
                        echo json_encode(['status' => 'error', 'message' => 'اسم المستخدم مستخدم مسبقاً']);
                        exit;
                    }
                    $sets[] = 'username = :username';
                    $params[':username'] = $input['username'];
                }
                if (!empty($input['password'])) {
                    $sets[] = 'password = :password';
                    $params[':password'] = password_hash($input['password'], PASSWORD_BCRYPT);
                }
                if (!empty($input['role'])) {
                    $sets[] = 'role = :role';
                    $params[':role'] = $input['role'];
                }
                if (array_key_exists('department_id', $input)) {
                    // القيمة المفحوصة لا الخام — فُحص وجود القسم وتفعيله أعلاه
                    $sets[] = 'department_id = :department_id';
                    $params[':department_id'] = $checkedDept;
                }
                if (isset($input['is_active'])) {
                    $sets[] = 'is_active = :is_active';
                    $params[':is_active'] = (int)$input['is_active'];
                }

                if (!$sets) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'لا توجد حقول للتعديل']);
                    exit;
                }

                $stmt = $pdo->prepare('UPDATE Users SET ' . implode(', ', $sets) . ' WHERE user_id = :id');
                $stmt->execute($params);
            } else {
                // مدير القسم: يستطيع فقط تفعيل/تعطيل موظفين تابعين لقسمه
                $owns = $pdo->prepare("
                    SELECT user_id FROM Users
                    WHERE user_id = :id AND department_id = :department_id
                      AND role IN ('officer', 'payment_center')
                ");
                $owns->execute([':id' => $user_id, ':department_id' => $user['department_id']]);
                if (!$owns->fetch()) {
                    http_response_code(403);
                    echo json_encode(['status' => 'error', 'message' => 'غير مصرح لك بتعديل هذا الحساب']);
                    exit;
                }

                $stmt = $pdo->prepare("UPDATE Users SET is_active = :is_active WHERE user_id = :id");
                $stmt->execute([
                    ':is_active' => isset($input['is_active']) ? (int)$input['is_active'] : 1,
                    ':id'        => $user_id,
                ]);
            }

            echo json_encode(['status' => 'success', 'message' => 'تم التعديل بنجاح']);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;
}
?>
