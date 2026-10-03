<?php
/* ============================================================
   حدّ المعدل لنقاط النهاية العامة (بلا مصادقة).
   نافذة منزلقة بملف لكل عنوان، بلا أي اعتماد خارجي.
   ============================================================ */

/** عنوان الطالب. لا نثق برؤوس الوكيل افتراضياً — تُزوَّر بسهولة. */
function clientIp(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * يسمح بـ$limit طلباً خلال $windowSeconds لكل عنوان.
 * يردّ 429 وينهي التنفيذ عند التجاوز.
 *
 * النافذة منزلقة لا ثابتة: الحدّ الثابت يسمح بضعف العدد على
 * حدّ الدقيقتين (٢٠ في آخر ثانية + ٢٠ في أول ثانية).
 */
function enforceRateLimit(string $bucket, int $limit = 20, int $windowSeconds = 60): void {
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'traffic_rl';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);

    $key  = $bucket . '|' . clientIp();
    $file = $dir . DIRECTORY_SEPARATOR . hash('sha256', $key) . '.json';

    $fh = @fopen($file, 'c+');
    if ($fh === false) return;   // تعذّر التخزين: لا نمنع الخدمة بسببه

    if (!flock($fh, LOCK_EX)) { fclose($fh); return; }

    $now  = microtime(true);
    $raw  = stream_get_contents($fh);
    $hits = json_decode($raw ?: '[]', true);
    if (!is_array($hits)) $hits = [];

    // إسقاط ما خرج من النافذة
    $cut  = $now - $windowSeconds;
    $hits = array_values(array_filter($hits, fn($t) => is_numeric($t) && $t > $cut));

    if (count($hits) >= $limit) {
        $retry = (int)ceil($hits[0] + $windowSeconds - $now);
        flock($fh, LOCK_UN);
        fclose($fh);

        http_response_code(429);
        header('Retry-After: ' . max(1, $retry));
        echo json_encode([
            'status'  => 'error',
            'message' => 'عدد كبير من الطلبات. يرجى المحاولة بعد قليل.'
        ]);
        exit;
    }

    $hits[] = $now;

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($hits));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
}
?>
