<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';
require_once '../../config/normalize.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = requireRole('admin', 'department_admin', 'officer', 'payment_center');

/* شروط البحث. المركبة قد تُعرَّف بلوحتها أو برقم هيكلها (بلا لوحات)،
   فأي رقم مركبة يُدخَل يُطابَق على العمودين معاً — لا يحتاج الباحث
   أن يعرف أيّهما بين يديه. */
const SEARCH_COLUMNS = [
    'issued_id'  => 'iv.issued_id = :issued_id',
    'license_no' => 'd.license_no = :license_no',
    'plate_no'   => '(v.plate_no = :plate_no OR v.chassis_no = :plate_no)',
    'chassis_no' => '(v.chassis_no = :chassis_no OR v.plate_no = :chassis_no)',
];

switch ($method) {

    case 'GET':
        try {
            $pdo = getConnection();

            $mandatory = [];
            $optional  = [];
            $params    = [];

            /* الحصر بالقسم لمدير القسم وحده — كما ينص التوثيق.
               رجل المرور ومركز الدفع بلا حصر عن قصد، ووظيفتان تعتمدان
               على ذلك: تنبيه المخالفات السابقة يجب أن يكشف مخالفات
               المركبة غير المسددة في كل الأقسام، ومركز الدفع يجب أن
               يحصّل مخالفة حُرّرت في قسم آخر. */
            if ($user['role'] === 'department_admin') {
                $mandatory[] = 'dp.department_id = :dept_id';
                $params[':dept_id'] = $user['department_id'];
            }

            /* المخالفة الملغاة تبقى في القاعدة ولا تظهر في النظام —
               صدرت بغير قصد، فلا تُحصَّل ولا تُحتسب ولا تُنبَّه عنها.
               مدير النظام وحده يستطيع استدعاءها بـinclude_inactive=1
               ليراجعها أو يعيد تفعيلها. */
            $seeInactive = $user['role'] === 'admin'
                        && !empty($_GET['include_inactive']);
            if (!$seeInactive) $mandatory[] = 'iv.is_active = 1';

            /* معرّف المركبة يُوحَّد في البحث بنفس قاعدة الحفظ، وإلا لم
               يجد من كتب «٣٣٧٨٤١» أو « 337841 » ما خُزّن «337841».
               هذا يسري على بحث مركز الدفع وعلى فحص المخالفات السابقة
               معاً — كلاهما يمرّ من هنا. */
            $vehicleFields = ['plate_no', 'chassis_no'];

            foreach (SEARCH_COLUMNS as $field => $condition) {
                if (!empty($_GET[$field])) {
                    $value = in_array($field, $vehicleFields, true)
                        ? normalizeVehicleId((string)$_GET[$field])
                        : trim((string)$_GET[$field]);
                    if ($value === '') continue;
                    $optional[] = $condition;
                    $params[":$field"] = $value;
                }
            }

            if (in_array($user['role'], ['payment_center', 'officer'], true) && !$optional) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'يرجى تحديد معيار بحث واحد على الأقل']);
                exit;
            }

            $where = [];
            if ($mandatory) $where[] = implode(' AND ', $mandatory);
            /* المعايير تُجمَع بـ AND: من أدخل رقم مخالفة ورقم لوحة يقصد
               السجل الذي يطابقهما معاً، لا أيّهما. وشرط رقم المركبة يحتفظ
               بـ OR الداخلي بين اللوحة والهيكل داخل قوسيه. */
            if ($optional)  $where[] = '(' . implode(' AND ', $optional) . ')';

            $sql = "
                SELECT
                    iv.*,
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
                    o.officer_unit,
                    o.employee_no,
                    dp.department_id,
                    dp.department_name,
                    dp.license_section,
                    dp.traffic_chief,
                    dp.directorate,
                    (
                        SELECT COALESCE(SUM(tv.fine_amount), 0)
                        FROM TicketViolations tv
                        WHERE tv.issued_id = iv.issued_id
                    ) AS total_fine,
                    (
                        SELECT JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'violation_id',          vl.violation_id,
                                'violation_article',     vl.violation_article,
                                'violation_description', vl.violation_description,
                                'fine_amount',           tv.fine_amount
                            )
                        )
                        FROM TicketViolations tv
                        JOIN Violations vl ON tv.violation_id = vl.violation_id
                        WHERE tv.issued_id = iv.issued_id
                    ) AS violations,
                    /* رقم الإيصال — دُمج سجل الإيصالات في هذا الجدول:
                       لكل مخالفة إيصالٌ واحد (uq_receipt_issued)، فكان
                       التبويبان يعرضان الصفوف نفسها بعمودين مختلفين. */
                    (
                        SELECT rc.receipt_id FROM Receipts rc
                        WHERE rc.issued_id = iv.issued_id LIMIT 1
                    ) AS receipt_id
                FROM IssuedViolations iv
                LEFT JOIN Drivers d      ON iv.driver_id    = d.driver_id
                LEFT JOIN Vehicles v     ON iv.vehicle_id   = v.vehicle_id
                LEFT JOIN Officers o     ON iv.officer_id   = o.officer_id
                LEFT JOIN Departments dp ON o.department_id = dp.department_id
            ";
            if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
            $sql .= ' ORDER BY iv.issued_id DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            foreach ($rows as &$row) {
                $row['violations'] = $row['violations']
                    ? json_decode($row['violations'], true)
                    : [];
            }
            unset($row);

            echo json_encode(['status' => 'success', 'data' => $rows]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'POST':
        requireRole('officer');

        /* حساب بدور officer بلا صف في Officers يُنتج مخالفة بـ officer_id
           فارغ — تصدر بنجاح ثم تختفي من تقرير قسمها بصمت. الرفض هنا هو
           الحاجز الأخير بعد إغلاق مسار إنشائها في users/index.php. */
        if (empty($user['officer_id'])) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'الحساب غير مرتبط بسجل رجل مرور']);
            exit;
        }

        try {
            $input = json_decode(file_get_contents('php://input'), true);

            $violation_ids = array_filter(
                array_map('intval', (array)($input['violation_ids'] ?? [])),
                fn($id) => $id > 0
            );

            /* المركبة تُعرَّف بلوحتها أو برقم هيكلها إن كانت بلا لوحات.
               التوحيد الثلاثي عند الحفظ — تشذيب، واختصار المسافات
               المتكررة، وتحويل الأرقام العربية الهندية إلى لاتينية —
               فتُخزَّن صيغة واحدة مهما تعدّدت صيغ الإدخال.
               التطبيع إلى NULL ضروري: السلسلة الفارغة تجتاز قيد CHECK
               في القاعدة فيمرّ سجل بلا معرّف. */
            $plate   = normalizeVehicleIdOrNull($input['plate_no']   ?? null);
            $chassis = normalizeVehicleIdOrNull($input['chassis_no'] ?? null);

            if (($plate === null && $chassis === null) || empty($violation_ids)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'رقم اللوحة أو رقم الهيكل ومخالفة واحدة على الأقل مطلوبة']);
                exit;
            }

            /* البند المكرر كان يُحذف بصمت بـarray_unique، فيظن المُصدِر أنه
               سجّل مخالفتين ويخرج الإيصال ببند واحد. الرفض الصريح أصدق. */
            if (count($violation_ids) !== count(array_unique($violation_ids))) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'لا يمكن تكرار نفس بند المخالفة في التذكرة الواحدة']);
                exit;
            }

            $pdo = getConnection();
            $pdo->beginTransaction();

            $stmtDriver = $pdo->prepare("
                INSERT INTO Drivers (driver_name, driver_job, license_no, license_class, license_issue, identity_card)
                VALUES (:driver_name, :driver_job, :license_no, :license_class, :license_issue, :identity_card)
            ");
            $stmtDriver->execute([
                ':driver_name'   => $input['driver_name']   ?? null,
                ':driver_job'    => $input['driver_job']    ?? null,
                ':license_no'    => $input['license_no']    ?? null,
                ':license_class' => $input['license_class'] ?? null,
                ':license_issue' => $input['license_issue'] ?? null,
                ':identity_card' => $input['identity_card'] ?? null,
            ]);
            $driver_id = $pdo->lastInsertId();

            $stmtVehicle = $pdo->prepare("
                INSERT INTO Vehicles (plate_no, chassis_no, vehicle_type, driver_id)
                VALUES (:plate_no, :chassis_no, :vehicle_type, :driver_id)
            ");
            $stmtVehicle->execute([
                ':plate_no'     => $plate,
                ':chassis_no'   => $chassis,
                ':vehicle_type' => $input['vehicle_type'] ?? null,
                ':driver_id'    => $driver_id,
            ]);
            $vehicle_id = $pdo->lastInsertId();

            $stmtIssued = $pdo->prepare("
                INSERT INTO IssuedViolations
                    (violation_status, issued_date, issued_time, location, driver_id, vehicle_id, officer_id)
                VALUES
                    ('pending', :date, :time, :location, :driver_id, :vehicle_id, :officer_id)
            ");
            $stmtIssued->execute([
                ':date'       => $input['issued_date'] ?? null,
                ':time'       => $input['issued_time'] ?? null,
                ':location'   => $input['location']    ?? null,
                ':driver_id'  => $driver_id,
                ':vehicle_id' => $vehicle_id,
                ':officer_id' => $user['officer_id'],
            ]);
            $issued_id = $pdo->lastInsertId();

            /* الغرامة تُنسَخ إلى البند وقت الإصدار، فتعديل الدليل لاحقاً لا
               يُعيد تسعير مخالفة صدرت وسُلّمت للسائق. القراءة والكتابة في
               الجملة نفسها داخل المعاملة، فلا نافذة بينهما. */
            $stmtTV = $pdo->prepare("
                INSERT INTO TicketViolations (issued_id, violation_id, fine_amount)
                SELECT :issued_id, vl.violation_id, vl.fine_amount
                FROM Violations vl WHERE vl.violation_id = :violation_id
            ");
            foreach ($violation_ids as $vid) {
                $stmtTV->execute([':issued_id' => $issued_id, ':violation_id' => $vid]);
                if ($stmtTV->rowCount() === 0) {
                    $pdo->rollBack();
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'أحد بنود المخالفة غير موجود في الدليل']);
                    exit;
                }
            }

            $stmtReceipt = $pdo->prepare("
                INSERT INTO Receipts (issued_id, driver_id, vehicle_id, officer_id)
                VALUES (:issued_id, :driver_id, :vehicle_id, :officer_id)
            ");
            $stmtReceipt->execute([
                ':issued_id'  => $issued_id,
                ':driver_id'  => $driver_id,
                ':vehicle_id' => $vehicle_id,
                ':officer_id' => $user['officer_id'],
            ]);

            $pdo->commit();

            echo json_encode([
                'status'  => 'success',
                'message' => 'تم إصدار المخالفة بنجاح',
                'id'      => $issued_id
            ]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    /* إلغاء تفعيل المخالفة وإعادته.
       الشرطي قد يُصدر عشر مخالفات بغير قصد في يوم، فيجمعها ويأتي بها
       إلى المركز. لا تُحذف — المحضر صدر وله رقم وإيصال، ومحوُه يفتح
       ثغرةً في تسلسل الأرقام ويُتلف أثر ما جرى. تُلغى: تبقى في القاعدة
       بكل بياناتها ولا تظهر في النظام ولا تُحصَّل ولا تُحتسب. */
    case 'PATCH':
        $user = requireRole('admin');
        try {
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($input['issued_id'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'رقم المخالفة مطلوب']);
                exit;
            }
            if (!array_key_exists('is_active', $input)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'الحالة المطلوبة غير محدَّدة']);
                exit;
            }

            $makeActive = (int)(bool)$input['is_active'];
            $pdo = getConnection();

            $cur = $pdo->prepare(
                "SELECT violation_status, is_active FROM IssuedViolations WHERE issued_id = :id"
            );
            $cur->execute([':id' => $input['issued_id']]);
            $row = $cur->fetch();

            if (!$row) {
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'المخالفة غير موجودة']);
                exit;
            }

            /* المدفوعة لا تُلغى: أُخذ مالٌ مقابلها وصدر إيصال تحصيل،
               وإخفاؤها يُخفي دفعةً قائمة فيختلّ الحساب. */
            if (!$makeActive && $row['violation_status'] === 'paid') {
                http_response_code(409);
                echo json_encode([
                    'status'  => 'error',
                    'message' => 'لا يمكن إلغاء مخالفة مدفوعة — الغرامة حُصّلت وصدر إيصالها'
                ]);
                exit;
            }

            if ((int)$row['is_active'] === $makeActive) {
                echo json_encode([
                    'status'  => 'success',
                    'message' => $makeActive ? 'المخالفة مفعَّلة أصلاً' : 'المخالفة ملغاة أصلاً'
                ]);
                exit;
            }

            $stmt = $pdo->prepare("
                UPDATE IssuedViolations
                SET is_active      = :active,
                    deactivated_at = CASE WHEN :active2 = 0 THEN NOW() ELSE NULL END,
                    deactivated_by = CASE WHEN :active3 = 0 THEN :uid ELSE NULL END
                WHERE issued_id = :id
            ");
            $stmt->execute([
                ':active'  => $makeActive,
                ':active2' => $makeActive,
                ':active3' => $makeActive,
                ':uid'     => $user['user_id'],
                ':id'      => $input['issued_id'],
            ]);

            echo json_encode([
                'status'  => 'success',
                'message' => $makeActive
                    ? 'أُعيد تفعيل المخالفة وعادت إلى النظام'
                    : 'أُلغيت المخالفة — بياناتها محفوظة ولن تظهر في النظام'
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

            if (empty($input['issued_id'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'رقم المخالفة مطلوب']);
                exit;
            }

            $status = $input['violation_status'] ?? null;
            if ($status !== null && !in_array($status, ['pending', 'paid'], true)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'حالة المخالفة غير صالحة']);
                exit;
            }

            $pdo   = getConnection();

            /* مخالفة مدفوعة لا تُعدَّل — كما لا تُحذف. التعديل كان يسمح
               بإعادتها إلى pending مع بقاء صف الدفع في Payments، وهي
               الحالة المختلّة نفسها التي تكشفها طبقة منع ازدواج الدفع. */
            $cur = $pdo->prepare("SELECT violation_status FROM IssuedViolations WHERE issued_id = :id");
            $cur->execute([':id' => $input['issued_id']]);
            $row = $cur->fetch();

            if (!$row) {
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'المخالفة غير موجودة']);
                exit;
            }

            if ($row['violation_status'] === 'paid') {
                http_response_code(409);
                echo json_encode(['status' => 'error', 'message' => 'لا يمكن تعديل مخالفة مدفوعة — يجب الاحتفاظ بسجلات الدفع']);
                exit;
            }

            $pdo->beginTransaction();

            /* الحقول المرسَلة وحدها تُعدَّل. الصيغة السابقة كانت تكتب
               الحقول الأربعة دائماً، فطلب يحمل violation_status وحده
               يمسح التاريخ والوقت والموقع بـNULL — وكان يُسقط عموداً
               NOT NULL بخطأ 500 لو صار أيّها إلزامياً لاحقاً.
               array_key_exists لا isset: القيمة null المرسلة صراحةً
               نيّة مسح، وغياب المفتاح نيّة إبقاء — وisset يخلط بينهما. */
            $sets   = [];
            $params = [':id' => $input['issued_id']];

            $editable = [
                'violation_status' => 'violation_status',
                'issued_date'      => 'issued_date',
                'issued_time'      => 'issued_time',
                'location'         => 'location',
            ];
            foreach ($editable as $key => $column) {
                if (array_key_exists($key, $input)) {
                    $sets[] = "$column = :$key";
                    $params[":$key"] = $input[$key];
                }
            }

            if ($sets) {
                $stmt = $pdo->prepare(
                    'UPDATE IssuedViolations SET ' . implode(', ', $sets) . ' WHERE issued_id = :id'
                );
                $stmt->execute($params);
            }

            /* بيانات السائق والمركبة تُعدَّل كذلك — واجهة التعديل صارت
               نسخة من واجهة الشرطي، فكل ما يُحرَّر أولاً يُصحَّح ثانياً.
               التعديل يقع على سجلَّي Drivers وVehicles المرتبطَين بهذه
               المخالفة وحدها، وهما لا يُشاركان غيرها إلا إن شاركا —
               وحينها يسري التصحيح عليها جميعاً، وهو الصواب لأنها
               سجلّ الشخص والمركبة نفسيهما لا نسخة لكل محضر. */
            $rowIds = $pdo->prepare(
                "SELECT driver_id, vehicle_id FROM IssuedViolations WHERE issued_id = :id"
            );
            $rowIds->execute([':id' => $input['issued_id']]);
            $ids = $rowIds->fetch();

            $driverEditable = ['driver_name', 'driver_job', 'license_no',
                               'license_class', 'license_issue', 'identity_card'];
            $dSets = []; $dParams = [':id' => $ids['driver_id'] ?? null];
            foreach ($driverEditable as $key) {
                if (array_key_exists($key, $input)) {
                    $dSets[] = "$key = :$key";
                    $dParams[":$key"] = $input[$key];
                }
            }
            if ($dSets && $dParams[':id'] !== null) {
                $pdo->prepare('UPDATE Drivers SET ' . implode(', ', $dSets) . ' WHERE driver_id = :id')
                    ->execute($dParams);
            }

            $vSets = []; $vParams = [':id' => $ids['vehicle_id'] ?? null];
            if (array_key_exists('plate_no', $input) || array_key_exists('chassis_no', $input)) {
                /* التوحيد نفسه المطبَّق عند الإصدار، والتطبيع إلى NULL
                   ضروري: السلسلة الفارغة تجتاز قيد CHECK فيمرّ سجل
                   مركبة بلا لوحة ولا هيكل. */
                $plateU   = normalizeVehicleIdOrNull($input['plate_no']   ?? null);
                $chassisU = normalizeVehicleIdOrNull($input['chassis_no'] ?? null);
                if ($plateU === null && $chassisU === null) {
                    $pdo->rollBack();
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'رقم اللوحة أو رقم الهيكل مطلوب']);
                    exit;
                }
                $vSets[] = 'plate_no = :plate_no';     $vParams[':plate_no']   = $plateU;
                $vSets[] = 'chassis_no = :chassis_no'; $vParams[':chassis_no'] = $chassisU;
            }
            if (array_key_exists('vehicle_type', $input)) {
                $vSets[] = 'vehicle_type = :vehicle_type';
                $vParams[':vehicle_type'] = $input['vehicle_type'];
            }
            if ($vSets && $vParams[':id'] !== null) {
                $pdo->prepare('UPDATE Vehicles SET ' . implode(', ', $vSets) . ' WHERE vehicle_id = :id')
                    ->execute($vParams);
            }

            if (!$sets && !$dSets && !$vSets && !array_key_exists('violation_ids', $input)) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'لا توجد حقول للتعديل']);
                exit;
            }

            if (!empty($input['violation_ids'])) {
                $violation_ids = array_filter(
                    array_map('intval', (array)$input['violation_ids']),
                    fn($id) => $id > 0
                );
                if (count($violation_ids) !== count(array_unique($violation_ids))) {
                    $pdo->rollBack();
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'لا يمكن تكرار نفس بند المخالفة في التذكرة الواحدة']);
                    exit;
                }
                if ($violation_ids) {
                    $pdo->prepare("DELETE FROM TicketViolations WHERE issued_id = :id")
                        ->execute([':id' => $input['issued_id']]);
                    /* البند المضاف بالتعديل يأخذ سعر الدليل الحالي — لأنه بند
                       جديد يُسجَّل الآن، لا إعادة تسعير لبند قائم. */
                    $stmtTV = $pdo->prepare("
                        INSERT INTO TicketViolations (issued_id, violation_id, fine_amount)
                        SELECT :issued_id, vl.violation_id, vl.fine_amount
                        FROM Violations vl WHERE vl.violation_id = :violation_id
                    ");
                    foreach ($violation_ids as $vid) {
                        $stmtTV->execute([':issued_id' => $input['issued_id'], ':violation_id' => $vid]);
                        if ($stmtTV->rowCount() === 0) {
                            $pdo->rollBack();
                            http_response_code(400);
                            echo json_encode(['status' => 'error', 'message' => 'أحد بنود المخالفة غير موجود في الدليل']);
                            exit;
                        }
                    }
                }
            }

            $pdo->commit();
            echo json_encode(['status' => 'success', 'message' => 'تم التعديل بنجاح']);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;

    case 'DELETE':
        /* المخالفة الصادرة محضر رسمي سُلّم للمخالف ولها إيصال — فلا
           تُحذف من النظام، وإنما تُصحَّح بالتعديل. المنع في الخادم لا
           في الواجهة وحدها، فلا يُتجاوز بطلب مباشر. */
        requireRole('admin');
        http_response_code(405);
        echo json_encode([
            'status'  => 'error',
            'message' => 'لا يمكن حذف مخالفة صادرة — يمكن تعديلها فقط'
        ]);
        exit;
}
?>
