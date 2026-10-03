<?php
require_once '../../config/database.php';
require_once '../../config/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

requireRole('admin');

switch ($method) {

    case 'GET':
        try {
            $pdo  = getConnection();
            $stmt = $pdo->query("
                SELECT
                    r.*,
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
                    dp.department_name,
                    dp.license_section,
                    dp.traffic_chief,
                    dp.directorate,
                    iv.violation_status,
                    iv.issued_date,
                    iv.issued_time,
                    iv.location,
                    COALESCE((
                        SELECT SUM(tv2.fine_amount)
                        FROM TicketViolations tv2
                        WHERE tv2.issued_id = r.issued_id
                    ), 0) AS total_fine,
                    (
                        SELECT COUNT(*)
                        FROM TicketViolations tv3
                        WHERE tv3.issued_id = r.issued_id
                    ) AS violation_count
                FROM Receipts r
                JOIN IssuedViolations iv ON r.issued_id = iv.issued_id AND iv.is_active = 1
                LEFT JOIN Drivers d           ON r.driver_id     = d.driver_id
                LEFT JOIN Vehicles v          ON r.vehicle_id    = v.vehicle_id
                LEFT JOIN Officers o          ON r.officer_id    = o.officer_id
                LEFT JOIN Departments dp      ON o.department_id = dp.department_id
                ORDER BY r.issued_id DESC
            ");
            $data = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $data]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'حدث خطأ في الخادم']);
        }
        break;
}
?>