-- ============================================================
--  نظام إدارة المخالفات المرورية — مخطط قاعدة البيانات الكامل
-- ============================================================
--  هذا الملف يُنشئ البنية وحدها بلا أي بيانات.
--  التنفيذ: هذا الملف أولاً، ثم database_seed.sql. راجع README-install.md
--
--  المحرك : InnoDB   (لدعم المعاملات والمفاتيح الأجنبية وقيود CHECK)
--  الترميز: utf8mb4  (لدعم العربية كاملةً)
--
--  ملاحظة على الإصدار: قيد CHECK الذي تعتمد عليه ميزة تسجيل المركبة
--  برقم الهيكل لا يُنفَّذ فعلياً إلا على MySQL 8.0.16 أو أحدث.
--
--  ترتيب الجداول أدناه ترتيب اعتماد لا ترتيب أهمية: كل جدول يسبق
--  ما يشير إليه، فيُنفَّذ الملف من أوله إلى آخره بلا تدخل يدوي.
-- ============================================================

CREATE DATABASE IF NOT EXISTS traffic_violations_system
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE traffic_violations_system;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
--  1) الأقسام — الكينونة المرجعية الأولى، يتبعها كل شيء
-- ============================================================
CREATE TABLE IF NOT EXISTS Departments (
    department_id    INT           NOT NULL AUTO_INCREMENT,
    department_name  VARCHAR(100)  NOT NULL,
    license_section  VARCHAR(100)  DEFAULT NULL,
    traffic_chief    VARCHAR(100)  DEFAULT NULL,
    directorate      VARCHAR(100)  DEFAULT NULL,
    location         VARCHAR(200)  DEFAULT NULL,
    /* التعطيل بدل الحذف: السجل وعلاقاته بالضباط والمخالفات تبقى */
    is_active        TINYINT(1)    NOT NULL DEFAULT 1,
    PRIMARY KEY (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  2) الحسابات
-- ============================================================
CREATE TABLE IF NOT EXISTS Users (
    user_id              INT           NOT NULL AUTO_INCREMENT,
    username             VARCHAR(150)  NOT NULL,
    /* تُخزَّن معمّاة بخوارزمية bcrypt، ولا تُحفظ كلمة مرور بنصها الصريح */
    password             VARCHAR(255)  NOT NULL,
    role                 ENUM('admin','department_admin','officer','payment_center') NOT NULL,
    department_id        INT           DEFAULT NULL,
    is_active            TINYINT(1)    NOT NULL DEFAULT 1,
    /* يميّز من عُطِّل تبعاً لتعطيل قسمه عمّن عُطِّل عمداً، فتُعاد
       تفعيل الفئة الأولى وحدها عند إعادة تفعيل القسم */
    deactivated_by_dept  TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id),
    UNIQUE KEY username (username),
    KEY department_id (department_id),
    CONSTRAINT users_ibfk_1 FOREIGN KEY (department_id)
        REFERENCES Departments (department_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  3) الضباط والموظفون — لكل حساب ميداني سجلٌّ هنا
-- ============================================================
CREATE TABLE IF NOT EXISTS Officers (
    officer_id     INT           NOT NULL AUTO_INCREMENT,
    employee_no    VARCHAR(50)   DEFAULT NULL,
    officer_name   VARCHAR(100)  NOT NULL,
    officer_rank   VARCHAR(50)   DEFAULT NULL,
    officer_unit   VARCHAR(100)  DEFAULT NULL,
    department_id  INT           DEFAULT NULL,
    user_id        INT           DEFAULT NULL,
    PRIMARY KEY (officer_id),
    /* حساب واحد على الأكثر لكل سجل ضابط */
    UNIQUE KEY user_id (user_id),
    KEY department_id (department_id),
    CONSTRAINT officers_ibfk_1 FOREIGN KEY (department_id)
        REFERENCES Departments (department_id) ON DELETE SET NULL,
    CONSTRAINT officers_ibfk_2 FOREIGN KEY (user_id)
        REFERENCES Users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  4) دليل المخالفات القانونية
-- ============================================================
CREATE TABLE IF NOT EXISTS Violations (
    violation_id           INT           NOT NULL AUTO_INCREMENT,
    violation_article      VARCHAR(50)   DEFAULT NULL,
    violation_description  TEXT,
    fine_amount            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (violation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  5) السائقون — كل الحقول اختيارية، فالمخالفة تُحرَّر في غياب السائق
-- ============================================================
CREATE TABLE IF NOT EXISTS Drivers (
    driver_id      INT           NOT NULL AUTO_INCREMENT,
    driver_name    VARCHAR(100)  DEFAULT NULL,
    driver_job     VARCHAR(100)  DEFAULT NULL,
    license_no     VARCHAR(50)   DEFAULT NULL,
    license_class  VARCHAR(50)   DEFAULT NULL,
    license_issue  VARCHAR(100)  DEFAULT NULL,
    identity_card  VARCHAR(50)   DEFAULT NULL,
    PRIMARY KEY (driver_id),
    KEY idx_drivers_license (license_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  6) المركبات
--     الفهرس على اللوحة فهرس عادي لا قيد تفرّد عن قصد: النظام
--     يُنشئ سجل مركبة جديداً مع كل مخالفة، فقيد التفرّد كان
--     سيمنع تحرير مخالفة ثانية للمركبة نفسها.
-- ============================================================
CREATE TABLE IF NOT EXISTS Vehicles (
    vehicle_id    INT          NOT NULL AUTO_INCREMENT,
    plate_no      VARCHAR(50)  DEFAULT NULL,
    chassis_no    VARCHAR(50)  DEFAULT NULL,
    vehicle_type  VARCHAR(50)  DEFAULT NULL,
    driver_id     INT          DEFAULT NULL,
    PRIMARY KEY (vehicle_id),
    KEY driver_id (driver_id),
    KEY idx_vehicles_plate (plate_no),
    KEY idx_vehicles_chassis (chassis_no),
    CONSTRAINT vehicles_ibfk_1 FOREIGN KEY (driver_id)
        REFERENCES Drivers (driver_id) ON DELETE SET NULL,
    /* الضمانة البنيوية لميزة تسجيل المركبات بلا لوحات:
       لا تُقبل مركبة بلا لوحة وبلا هيكل. والسلسلة الفارغة
       مرفوضة كذلك، وإلا مرّ سجل بلا معرّف حقيقي. */
    CONSTRAINT chk_vehicle_identifier CHECK (
        (plate_no   IS NOT NULL AND plate_no   <> '')
     OR (chassis_no IS NOT NULL AND chassis_no <> '')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  7) المخالفات الصادرة — الكينونة التشغيلية المحورية
-- ============================================================
CREATE TABLE IF NOT EXISTS IssuedViolations (
    issued_id         INT       NOT NULL AUTO_INCREMENT,
    violation_status  ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    /* المخالفة الصادرة بغير قصد تُلغى ولا تُحذف: تبقى بياناتها
       كاملةً ولا تظهر في النظام ولا تُحصَّل ولا تدخل التقارير */
    is_active         TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'مخالفة ملغاة: تبقى في القاعدة ولا تظهر في النظام',
    deactivated_at    DATETIME  DEFAULT NULL
        COMMENT 'لحظة الإلغاء — أثرٌ لمن راجع المحضر',
    deactivated_by    INT       DEFAULT NULL
        COMMENT 'الحساب الذي ألغى التفعيل',
    issued_date       DATE      DEFAULT NULL,
    issued_time       TIME      DEFAULT NULL,
    location          VARCHAR(200) DEFAULT NULL,
    driver_id         INT       DEFAULT NULL,
    vehicle_id        INT       DEFAULT NULL,
    officer_id        INT       DEFAULT NULL,
    PRIMARY KEY (issued_id),
    KEY driver_id (driver_id),
    KEY vehicle_id (vehicle_id),
    KEY idx_iv_date_status (issued_date, violation_status),
    KEY idx_iv_officer_date (officer_id, issued_date),
    KEY fk_iv_deactivated_by (deactivated_by),
    KEY idx_iv_active (is_active),
    CONSTRAINT fk_iv_deactivated_by FOREIGN KEY (deactivated_by)
        REFERENCES Users (user_id) ON DELETE SET NULL,
    CONSTRAINT issuedviolations_ibfk_1 FOREIGN KEY (driver_id)
        REFERENCES Drivers (driver_id) ON DELETE SET NULL,
    CONSTRAINT issuedviolations_ibfk_2 FOREIGN KEY (vehicle_id)
        REFERENCES Vehicles (vehicle_id) ON DELETE SET NULL,
    /* المنع لا الفصل: فصل الضابط عن مخالفاته يُفقد المحضر محرّره
       ويُخرجه من تقارير قسمه بلا أي رسالة خطأ */
    CONSTRAINT issuedviolations_ibfk_3 FOREIGN KEY (officer_id)
        REFERENCES Officers (officer_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  8) بنود التذكرة — علاقة متعدد إلى متعدد
--     fine_amount هنا نسخة من سعر الدليل لحظة الإصدار، فتعديل
--     الدليل لاحقاً لا يُعيد تسعير مخالفة صدرت وسُلّمت للسائق.
-- ============================================================
CREATE TABLE IF NOT EXISTS TicketViolations (
    id            INT           NOT NULL AUTO_INCREMENT,
    issued_id     INT           NOT NULL,
    violation_id  INT           NOT NULL,
    fine_amount   DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    /* يمنع إضافة البند نفسه مرتين إلى التذكرة فتتضاعف غرامته */
    UNIQUE KEY uq_ticket_violation (issued_id, violation_id),
    KEY violation_id (violation_id),
    CONSTRAINT ticketviolations_ibfk_1 FOREIGN KEY (issued_id)
        REFERENCES IssuedViolations (issued_id) ON DELETE CASCADE,
    /* بلا ON DELETE: السلوك الافتراضي RESTRICT، فيُمنع حذف بند
       دليل مستخدَم في تذكرة صادرة */
    CONSTRAINT ticketviolations_ibfk_2 FOREIGN KEY (violation_id)
        REFERENCES Violations (violation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
--  9) الدفعات
-- ============================================================
CREATE TABLE IF NOT EXISTS Payments (
    payment_id      INT           NOT NULL AUTO_INCREMENT,
    issued_id       INT           NOT NULL,
    payment_method  ENUM('cash','card','libyana','sadad') NOT NULL,
    amount          DECIMAL(10,2) DEFAULT NULL,
    payment_date    DATE          DEFAULT NULL,
    payment_time    TIME          DEFAULT NULL,
    /* فارغ في الدفع الذاتي، إذ لا موظف يُنسب إليه */
    processed_by    INT           DEFAULT NULL,
    payment_status  ENUM('paid','refunded') NOT NULL DEFAULT 'paid',
    PRIMARY KEY (payment_id),
    /* الطبقة الرابعة والأخيرة في منع ازدواج الدفع — الوحيدة التي
       لا تُتجاوز حتى لو استُدعيت القاعدة مباشرة */
    UNIQUE KEY uq_payment_issued (issued_id),
    KEY processed_by (processed_by),
    KEY idx_pay_date (payment_date),
    CONSTRAINT payments_ibfk_1 FOREIGN KEY (issued_id)
        REFERENCES IssuedViolations (issued_id) ON DELETE CASCADE,
    CONSTRAINT payments_ibfk_2 FOREIGN KEY (processed_by)
        REFERENCES Users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 10) الإيصالات — سجل أرشيفي يُكتب مع إصدار كل مخالفة
-- ============================================================
CREATE TABLE IF NOT EXISTS Receipts (
    receipt_id  INT NOT NULL AUTO_INCREMENT,
    issued_id   INT DEFAULT NULL,
    driver_id   INT DEFAULT NULL,
    vehicle_id  INT DEFAULT NULL,
    officer_id  INT DEFAULT NULL,
    PRIMARY KEY (receipt_id),
    /* إيصال أرشيفي واحد لكل مخالفة */
    UNIQUE KEY uq_receipt_issued (issued_id),
    KEY driver_id (driver_id),
    KEY vehicle_id (vehicle_id),
    KEY officer_id (officer_id),
    CONSTRAINT receipts_ibfk_1 FOREIGN KEY (issued_id)
        REFERENCES IssuedViolations (issued_id) ON DELETE CASCADE,
    CONSTRAINT receipts_ibfk_2 FOREIGN KEY (driver_id)
        REFERENCES Drivers (driver_id) ON DELETE SET NULL,
    CONSTRAINT receipts_ibfk_3 FOREIGN KEY (vehicle_id)
        REFERENCES Vehicles (vehicle_id) ON DELETE SET NULL,
    CONSTRAINT receipts_ibfk_4 FOREIGN KEY (officer_id)
        REFERENCES Officers (officer_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  الحصيلة: 10 جداول · 16 مفتاحاً أجنبياً · 5 قيود تفرّد
--           7 فهارس صريحة · قيد تحقق واحد
-- ============================================================
