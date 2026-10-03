<?php
/* ============================================================
   إخفاء جزئي للبيانات الشخصية — للواجهة العامة وحدها.
   واجهات الأدوار الأربعة محمية بجلسة وتعرض البيانات كاملة،
   فلا تستدعي هذا الملف.
   ============================================================ */

/**
 * يُبقي آخر أربعة محارف ويستبدل ما قبلها بنجوم.
 * القيمة الأقصر من خمسة محارف تُنجَّم كلها: إظهار «آخر أربعة»
 * من رقم طوله أربعة يعني إظهاره كاملاً بلا إخفاء.
 */
function maskTail(?string $value, int $visible = 4): ?string {
    if ($value === null) return null;
    $value = trim($value);
    if ($value === '') return $value;

    // mb_* لأن البيانات utf8mb4 وقد تحمل محارف عربية
    $len = mb_strlen($value, 'UTF-8');
    if ($len <= $visible) {
        return str_repeat('*', $len);
    }
    return str_repeat('*', $len - $visible) . mb_substr($value, -$visible, null, 'UTF-8');
}

/**
 * الاسم الأول والأخير فقط — تُحذف الأسماء الوسطى.
 * «نوري إبراهيم القاضي» ← «نوري القاضي»
 */
function maskMiddleNames(?string $name): ?string {
    if ($name === null) return null;
    $name = trim(preg_replace('/\s+/u', ' ', $name));
    if ($name === '') return $name;

    $parts = explode(' ', $name);
    if (count($parts) <= 2) return $name;

    return $parts[0] . ' ' . $parts[count($parts) - 1];
}
?>
