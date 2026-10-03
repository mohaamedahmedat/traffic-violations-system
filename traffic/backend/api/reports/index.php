<?php
/* ============================================================
   تقارير مدير النظام — نقطة نهاية موحّدة
   كل التجميع يتم في SQL بعبارات مُعدَّة (Prepared Statements).

   تنبيه بنيوي: التذكرة الواحدة قد تحمل عدة مخالفات
   (١١ تذكرة من ٢٧ حالياً). لذلك:
     • عدد التذاكر  -> COUNT(DISTINCT iv.issued_id)
     • إجمالي الغرامات -> استعلام فرعي لكل تذكرة، لا SUM فوق الوصل
   وإلا تضخّمت الأرقام.
   ============================================================ */
require_once '../../config/database.php';
require_once '../../config/auth.php';
require_once '../../config/normalize.php';

$user = requireRole('admin', 'department_admin');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'طريقة غير مسموحة']);
    exit;
}

$pdo = getConnection();

/* حصر مدير القسم على قسمه — يُفرض هنا ولا يمكن تجاوزه من الطلب.
   أي department_id يرسله يُتجاهل. */
$scopeDept = $user['role'] === 'department_admin' ? (int)$user['department_id'] : null;

/* ---------- قوائم الفلاتر المنسدلة ---------- */
if (!empty($_GET['meta'])) {
    try {
        // ضباط القسم فقط لمدير القسم
        if ($scopeDept !== null) {
            $st = $pdo->prepare("
                SELECT o.officer_id, o.officer_name, o.employee_no, d.department_name
                FROM Officers o
                LEFT JOIN Departments d ON o.department_id = d.department_id
                WHERE o.department_id = :dept
                ORDER BY o.officer_name
            ");
            $st->execute([':dept' => $scopeDept]);
            $officers = $st->fetchAll();

            $st = $pdo->prepare("SELECT department_id, department_name FROM Departments WHERE department_id = :dept");
            $st->execute([':dept' => $scopeDept]);
            $departments = $st->fetchAll();

            $st = $pdo->prepare("
                SELECT MIN(iv.issued_date) AS min_date, MAX(iv.issued_date) AS max_date
                FROM IssuedViolations iv
                LEFT JOIN Officers o ON iv.officer_id = o.officer_id
                WHERE iv.is_active = 1 AND o.department_id = :dept
            ");
            $st->execute([':dept' => $scopeDept]);
            $range = $st->fetch();
        } else {
            $officers = $pdo->query("
                SELECT o.officer_id, o.officer_name, o.employee_no, d.department_name
                FROM Officers o
                LEFT JOIN Departments d ON o.department_id = d.department_id
                ORDER BY o.officer_name
            ")->fetchAll();

            $departments = $pdo->query("
                SELECT department_id, department_name FROM Departments ORDER BY department_name
            ")->fetchAll();

            $range = $pdo->query("
                SELECT MIN(issued_date) AS min_date, MAX(issued_date) AS max_date
                FROM IssuedViolations WHERE is_active = 1
            ")->fetch();
        }

        $violations = $pdo->query("
            SELECT violation_id, violation_article, violation_description, fine_amount
            FROM Violations ORDER BY violation_id
        ")->fetchAll();

        echo json_encode([
            'status'      => 'success',
            'scoped'      => $scopeDept !== null,
            'officers'    => $officers,
            'violations'  => $violations,
            'departments' => $departments,
            'range'       => $range,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
    }
    exit;
}

/* ---------- تفاصيل مخالفة واحدة ---------- */
if (!empty($_GET['detail']) && ctype_digit((string)$_GET['detail'])) {
    try {
        $id = (int)$_GET['detail'];

        // الحصر يسري هنا أيضاً: مدير القسم لا يفتح مخالفة قسم آخر
        $scopeSql = $scopeDept !== null ? ' AND o.department_id = :scope_dept' : '';
        $st = $pdo->prepare("
            SELECT
                iv.issued_id, iv.issued_date, iv.issued_time, iv.violation_status, iv.location,
                o.officer_id, o.officer_name, o.employee_no, o.officer_rank, o.officer_unit,
                dp.department_id, dp.department_name, dp.license_section, dp.directorate, dp.traffic_chief,
                d.driver_name, d.driver_job, d.license_no, d.license_class, d.license_issue, d.identity_card,
                v.plate_no, v.chassis_no, v.vehicle_type,
                (SELECT COALESCE(SUM(tv.fine_amount),0)
                 FROM TicketViolations tv
                 WHERE tv.issued_id = iv.issued_id) AS total_fine
            FROM IssuedViolations iv
            LEFT JOIN Officers    o  ON iv.officer_id  = o.officer_id
            LEFT JOIN Departments dp ON o.department_id = dp.department_id
            LEFT JOIN Drivers     d  ON iv.driver_id   = d.driver_id
            LEFT JOIN Vehicles    v  ON iv.vehicle_id  = v.vehicle_id
            WHERE iv.is_active = 1 AND iv.issued_id = :id$scopeSql
        ");
        $bind = [':id' => $id];
        if ($scopeDept !== null) $bind[':scope_dept'] = $scopeDept;
        $st->execute($bind);
        $row = $st->fetch();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'المخالفة غير موجودة أو خارج نطاقك']);
            exit;
        }

        // بنود المخالفة مفصّلة لا مدموجة
        $st = $pdo->prepare("
            SELECT vl.violation_id, vl.violation_article, vl.violation_description, tv.fine_amount
            FROM TicketViolations tv
            JOIN Violations vl ON vl.violation_id = tv.violation_id
            WHERE tv.issued_id = :id
            ORDER BY vl.violation_id
        ");
        $st->execute([':id' => $id]);
        $row['violations'] = $st->fetchAll();

        // بيانات الدفع إن وُجدت
        $st = $pdo->prepare("
            SELECT p.payment_id, p.payment_method, p.amount, p.payment_date, p.payment_time,
                   p.payment_status, u.username AS processed_by_username
            FROM Payments p
            LEFT JOIN Users u ON p.processed_by = u.user_id
            WHERE p.issued_id = :id
        ");
        $st->execute([':id' => $id]);
        $row['payment'] = $st->fetch() ?: null;

        echo json_encode(['status' => 'success', 'data' => $row]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
    }
    exit;
}

/* ---------- بناء شرط التصفية مرة واحدة ---------- */
$where  = [];
$params = [];

/* المخالفة الملغاة خارج كل حساب: صدرت بغير قصد، فلا تُعدّ في
   الإحصاء ولا في المستحقّ ولا في أداء الضابط. الشرط أول الشروط
   ولا يُستثنى منه أحد — حتى مدير النظام لا يريدها في تقاريره. */
$where[] = 'iv.is_active = 1';

// حصر إجباري أولاً — مدير القسم لا يرى غير قسمه مهما أرسل
if ($scopeDept !== null) {
    $where[] = 'o.department_id = :scope_dept';
    $params[':scope_dept'] = $scopeDept;
}

$from = $_GET['from'] ?? '';
$to   = $_GET['to']   ?? '';
$isDate = fn($d) => (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);

if ($isDate($from)) { $where[] = 'iv.issued_date >= :from'; $params[':from'] = $from; }
if ($isDate($to))   { $where[] = 'iv.issued_date <= :to';   $params[':to']   = $to; }

if (!empty($_GET['officer_id']) && ctype_digit((string)$_GET['officer_id'])) {
    $where[] = 'iv.officer_id = :officer_id';
    $params[':officer_id'] = (int)$_GET['officer_id'];
}

// فلتر القسم متاح للمدير فقط — مدير القسم محصور مسبقاً
if ($scopeDept === null && !empty($_GET['department_id']) && ctype_digit((string)$_GET['department_id'])) {
    $where[] = 'o.department_id = :department_id';
    $params[':department_id'] = (int)$_GET['department_id'];
}

if (!empty($_GET['status']) && in_array($_GET['status'], ['paid', 'pending'], true)) {
    $where[] = 'iv.violation_status = :status';
    $params[':status'] = $_GET['status'];
}

/* المخالفات التي مضى على تحريرها 72 ساعة فأكثر.
   القياس من لحظة التحرير لا من تاريخه وحده: مخالفة حُرّرت أمس
   الساعة 23:00 لم يمضِ عليها 72 ساعة، ومقارنة التواريخ وحدها
   كانت ستعدّها كذلك. والوقت قد يكون NULL في سجلات قديمة، فيُحمل
   على منتصف الليل — وهو الافتراض الأحوط لأنه يؤخّر استحقاقها. */
$ageHours = $_GET['age_hours'] ?? '';
if (ctype_digit((string)$ageHours) && (int)$ageHours > 0) {
    $where[] = 'TIMESTAMPDIFF(HOUR,
                    TIMESTAMP(iv.issued_date, COALESCE(iv.issued_time, "00:00:00")),
                    NOW()) >= :age_hours';
    $params[':age_hours'] = (int)$ageHours;
}

if (!empty($_GET['violation_id']) && ctype_digit((string)$_GET['violation_id'])) {
    $where[] = 'EXISTS (SELECT 1 FROM TicketViolations tvf
                        WHERE tvf.issued_id = iv.issued_id AND tvf.violation_id = :violation_id)';
    $params[':violation_id'] = (int)$_GET['violation_id'];
}

// بحث حر: لوحة · هيكل · رخصة · رقم مخالفة · اسم/رقم ضابط · اسم سائق · بطاقة
// الهيكل مشمول وإلا صارت المركبات بلا لوحات غير قابلة للعثور عليها.
/* التوحيد الثلاثي يسري هنا أيضاً — وهو موضع البحث الرابع بعد الإصدار
   وبحث مركز الدفع وفحص المخالفات السابقة. الحقول التي يمسّها رقمية
   في معظمها (لوحة · هيكل · رخصة · بطاقة · رقم مخالفة)، فمن كتبها
   بأرقام عربية كان لا يجد شيئاً. واختصار المسافات يفيد أسماء
   السائقين والضباط كذلك: «محمد  علي» يصير «محمد علي». */
$q = normalizeVehicleId((string)($_GET['q'] ?? '')) ?? '';
if ($q !== '') {
    $where[] = '(v.plate_no LIKE :q OR v.chassis_no LIKE :q
                 OR d.license_no LIKE :q OR d.driver_name LIKE :q
                 OR d.identity_card LIKE :q OR o.officer_name LIKE :q OR o.employee_no LIKE :q
                 OR CAST(iv.issued_id AS CHAR) = :qexact)';
    $params[':q']      = '%' . $q . '%';
    $params[':qexact'] = $q;
}

$WHERE = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

/* الوصل الأساسي — ثابت لكل الاستعلامات */
$JOIN = "
    FROM IssuedViolations iv
    LEFT JOIN Officers    o  ON iv.officer_id  = o.officer_id
    LEFT JOIN Departments dp ON o.department_id = dp.department_id
    LEFT JOIN Drivers     d  ON iv.driver_id   = d.driver_id
    LEFT JOIN Vehicles    v  ON iv.vehicle_id  = v.vehicle_id
";

/* غرامة التذكرة الواحدة — يمنع العدّ المزدوج.
   يقرأ من TicketViolations.fine_amount المحفوظة وقت الإصدار، لا من
   الدليل، فتقرير شهر مضى لا يتغيّر إن عُدّلت تسعيرة اليوم. */
const FINE_SUB = "(SELECT COALESCE(SUM(tv.fine_amount),0)
                   FROM TicketViolations tv
                   WHERE tv.issued_id = iv.issued_id)";

try {
    /* ---------- ١. البطاقات الإحصائية ---------- */
    $sql = "SELECT
                COUNT(*)                                                   AS tickets,
                COALESCE(SUM(t.is_paid),0)                                 AS paid,
                COUNT(*) - COALESCE(SUM(t.is_paid),0)                      AS pending,
                COALESCE(SUM(t.fine),0)                                    AS total_fines,
                COALESCE(SUM(CASE WHEN t.is_paid=1 THEN t.fine ELSE 0 END),0) AS collected,
                COALESCE(SUM(CASE WHEN t.is_paid=0 THEN t.fine ELSE 0 END),0) AS outstanding,
                COALESCE(SUM(t.line_count),0)                              AS violation_lines
            FROM (
                SELECT iv.issued_id,
                       (iv.violation_status='paid') AS is_paid,
                       " . FINE_SUB . " AS fine,
                       (SELECT COUNT(*) FROM TicketViolations tv2 WHERE tv2.issued_id=iv.issued_id) AS line_count
                $JOIN
                $WHERE
            ) t";
    $st = $pdo->prepare($sql); $st->execute($params);
    $summary = $st->fetch();
    $summary['avg_fine'] = $summary['tickets'] > 0
        ? round($summary['total_fines'] / $summary['tickets'], 2) : 0;

    /* ---------- ٢. حسب الضابط ---------- */
    $sql = "SELECT
                o.officer_id, o.officer_name, o.employee_no, o.officer_rank,
                dp.department_name,
                COUNT(DISTINCT iv.issued_id) AS tickets,
                COUNT(DISTINCT CASE WHEN iv.violation_status='paid' THEN iv.issued_id END) AS paid,
                COALESCE(SUM(" . FINE_SUB . "),0) AS total_fines
            $JOIN
            $WHERE
            GROUP BY o.officer_id, o.officer_name, o.employee_no, o.officer_rank, dp.department_name
            ORDER BY tickets DESC, total_fines DESC";
    $st = $pdo->prepare($sql); $st->execute($params);
    $byOfficer = $st->fetchAll();

    /* ---------- ٣. حسب نوع المخالفة (عدّ البنود مقصود هنا) ---------- */
    $sql = "SELECT
                vl.violation_id, vl.violation_article, vl.violation_description,
                COUNT(*)                       AS times,
                SUM(tvg.fine_amount)           AS total_fines,
                COUNT(DISTINCT iv.issued_id)   AS tickets
            $JOIN
            JOIN TicketViolations tvg ON tvg.issued_id = iv.issued_id
            JOIN Violations       vl  ON vl.violation_id = tvg.violation_id
            $WHERE
            GROUP BY vl.violation_id, vl.violation_article, vl.violation_description
            ORDER BY times DESC";
    $st = $pdo->prepare($sql); $st->execute($params);
    $byViolation = $st->fetchAll();

    /* ---------- ٤. حسب القسم ---------- */
    $sql = "SELECT
                dp.department_id, dp.department_name,
                COUNT(DISTINCT iv.issued_id) AS tickets,
                COUNT(DISTINCT CASE WHEN iv.violation_status='paid' THEN iv.issued_id END) AS paid,
                COALESCE(SUM(" . FINE_SUB . "),0) AS total_fines
            $JOIN
            $WHERE
            GROUP BY dp.department_id, dp.department_name
            ORDER BY tickets DESC";
    $st = $pdo->prepare($sql); $st->execute($params);
    $byDepartment = $st->fetchAll();

    /* ---------- ٥. طرق الدفع (على التذاكر المصفّاة) ---------- */
    $sql = "SELECT p.payment_method,
                   COUNT(*)             AS operations,
                   COALESCE(SUM(p.amount),0) AS collected
            $JOIN
            JOIN Payments p ON p.issued_id = iv.issued_id
            $WHERE
            GROUP BY p.payment_method
            ORDER BY collected DESC";
    $st = $pdo->prepare($sql); $st->execute($params);
    $byMethod = $st->fetchAll();

    /* ---------- ٦. الاتجاه الزمني ---------- */
    // يومي للمدى القصير، شهري للطويل
    $span = ($isDate($from) && $isDate($to))
        ? (strtotime($to) - strtotime($from)) / 86400
        : 999;
    $bucket = $span <= 62 ? '%Y-%m-%d' : '%Y-%m';
    $sql = "SELECT DATE_FORMAT(iv.issued_date, '$bucket') AS bucket,
                   COUNT(DISTINCT iv.issued_id) AS tickets,
                   COALESCE(SUM(" . FINE_SUB . "),0) AS total_fines
            $JOIN
            $WHERE
            GROUP BY bucket
            ORDER BY bucket";
    $st = $pdo->prepare($sql); $st->execute($params);
    $timeline = $st->fetchAll();

    /* ---------- ٧. السجل التفصيلي ---------- */
    $sortMap = [
        'issued_id'   => 'iv.issued_id',
        'issued_date' => 'iv.issued_date',
        'officer'     => 'o.officer_name',
        'department'  => 'dp.department_name',
        'driver'      => 'd.driver_name',
        'plate'       => 'COALESCE(v.plate_no, v.chassis_no)',
        'fine'        => 'fine',
        'status'      => 'iv.violation_status',
    ];
    $sortKey = $_GET['sort'] ?? 'issued_id';
    $sortCol = $sortMap[$sortKey] ?? 'iv.issued_id';
    $dir     = strtolower($_GET['dir'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

    $export  = ($_GET['export'] ?? '') === 'csv';
    $perPage = min(max((int)($_GET['per_page'] ?? 50), 1), 200);
    $page    = max((int)($_GET['page'] ?? 1), 1);
    $offset  = ($page - 1) * $perPage;

    $detailSelect = "SELECT
                iv.issued_id, iv.issued_date, iv.issued_time, iv.violation_status, iv.location,
                o.officer_name, o.employee_no,
                dp.department_name,
                d.driver_name, d.license_no, d.identity_card,
                v.plate_no, v.chassis_no, v.vehicle_type,
                " . FINE_SUB . " AS fine,
                (SELECT GROUP_CONCAT(vl2.violation_description ORDER BY vl2.violation_id SEPARATOR ' + ')
                 FROM TicketViolations tv3
                 JOIN Violations vl2 ON vl2.violation_id = tv3.violation_id
                 WHERE tv3.issued_id = iv.issued_id) AS violations_text,
                (SELECT COUNT(*) FROM TicketViolations tv4 WHERE tv4.issued_id = iv.issued_id) AS violations_count
            $JOIN
            $WHERE
            ORDER BY $sortCol $dir";

    if ($export) {
        // تصدير كل النتائج المصفّاة، بلا ترقيم صفحات
        $st = $pdo->prepare($detailSelect);
        $st->execute($params);
        $rows = $st->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="report-' . date('Ymd-His') . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");   // BOM ليقرأ Excel العربية صحيحة
        fputcsv($out, ['رقم المخالفة','التاريخ','الساعة','الضابط','رقم الضابط','القسم',
                       'السائق','رقم الرخصة','اللوحة','رقم الهيكل','نوع المركبة','المخالفات','الغرامة','الحالة','الموقع']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['issued_id'], $r['issued_date'], $r['issued_time'],
                $r['officer_name'], $r['employee_no'], $r['department_name'],
                $r['driver_name'], $r['license_no'], $r['plate_no'], $r['chassis_no'], $r['vehicle_type'],
                $r['violations_text'], $r['fine'],
                $r['violation_status'] === 'paid' ? 'مدفوعة' : 'معلّقة',
                $r['location'],
            ]);
        }
        fclose($out);
        exit;
    }

    $st = $pdo->prepare("SELECT COUNT(*) $JOIN $WHERE");
    $st->execute($params);
    $totalRows = (int)$st->fetchColumn();

    $st = $pdo->prepare($detailSelect . " LIMIT $perPage OFFSET $offset");
    $st->execute($params);
    $details = $st->fetchAll();

    echo json_encode([
        'status'        => 'success',
        'summary'       => $summary,
        'by_officer'    => $byOfficer,
        'by_violation'  => $byViolation,
        'by_department' => $byDepartment,
        'by_method'     => $byMethod,
        'timeline'      => $timeline,
        'details'       => [
            'rows'     => $details,
            'total'    => $totalRows,
            'page'     => $page,
            'per_page' => $perPage,
            'pages'    => (int)ceil($totalRows / $perPage),
        ],
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
}
?>
