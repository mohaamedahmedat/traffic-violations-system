<?php
require_once '../../config/database.php';
require_once '../../config/privacy.php';
require_once '../../config/ratelimit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'طريقة غير مسموحة']);
    exit;
}

/* النقطة بلا مصادقة ومفتاحها رقم تسلسلي، فتجربة الأرقام تتابعاً
   تحصد بيانات السائقين جملةً. الحدّ يجعل الحصاد غير عملي، والإخفاء
   الجزئي أدناه يجعل ما يُحصَد بلا قيمة. */
enforceRateLimit('public_lookup', 20, 60);

$issued_id = $_GET['issued_id'] ?? null;

if (empty($issued_id) || !ctype_digit((string)$issued_id)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'يرجى إدخال رقم مخالفة صالح']);
    exit;
}

try {
    $pdo  = getConnection();
    $stmt = $pdo->prepare("
        SELECT
            iv.issued_id, iv.violation_status, iv.issued_date, iv.issued_time, iv.location,
            d.driver_name, d.identity_card, d.license_no, d.license_class,
            v.plate_no, v.chassis_no, v.vehicle_type,
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
            ) AS violations
        FROM IssuedViolations iv
        LEFT JOIN Drivers d  ON iv.driver_id  = d.driver_id
        LEFT JOIN Vehicles v ON iv.vehicle_id = v.vehicle_id
        WHERE iv.issued_id = :id AND iv.is_active = 1
    ");
    $stmt->execute([':id' => $issued_id]);
    $data = $stmt->fetch();

    if (!$data) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'لم يتم العثور على مخالفة بهذا الرقم']);
        exit;
    }

    $data['violations'] = $data['violations']
        ? json_decode($data['violations'], true)
        : [];

    /* الإخفاء الجزئي يقع هنا — في الخادم لا في الواجهة — فالبيانات
       الكاملة لا تغادر الخادم أصلاً ولا تُرى في استجابة الشبكة.
       ما يبقى ظاهراً يكفي صاحب المخالفة ليتعرّف على مخالفته،
       ولا يكفي من يجرّب الأرقام تتابعاً ليبني قاعدة بيانات. */
    $data['driver_name']   = maskMiddleNames($data['driver_name']);
    $data['identity_card'] = maskTail($data['identity_card']);
    $data['license_no']    = maskTail($data['license_no']);
    $data['plate_no']      = maskTail($data['plate_no']);
    $data['chassis_no']    = maskTail($data['chassis_no']);

    echo json_encode(['status' => 'success', 'data' => $data]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
}
?>
