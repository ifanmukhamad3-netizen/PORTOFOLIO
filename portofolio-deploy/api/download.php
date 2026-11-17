<?php
/**
 * ============================================================================
 * IMPERIUM — DOWNLOAD API (pengunduhan file tugas untuk semua pengunjung)
 * ----------------------------------------------------------------------------
 *   GET api/download.php?courseId=X&meetingNo=1   → aliran file asli (attachment)
 *
 * Endpoint ini SENGAJA PUBLIK (tanpa login): Mode Dosen & pengunjung dapat
 * mengunduh seluruh file tugas, sesuai kebijakan Academic Repository.
 *
 * Keamanan yang diterapkan:
 *   - courseId divalidasi ketat; meetingNo harus angka.
 *   - Ekstensi file diperiksa terhadap whitelist yang sama dengan upload.
 *   - Isi base64 didekode & MIME-nya diverifikasi (finfo) sebelum dikirim;
 *     header Content-Type dipetakan aman + X-Content-Type-Options: nosniff.
 *   - File SELALU dikirim sebagai "attachment" (tidak pernah dieksekusi/ditampilkan
 *     inline oleh browser), sehingga file HTML/PHP palsu tidak berbahaya.
 *   - Nama file dibersihkan (tanpa jalur/karakter kontrol) + RFC 5987 UTF-8.
 * ============================================================================
 */

require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method tidak didukung.', 405);
}

$cid = isset($_GET['courseId'])  ? trim((string)$_GET['courseId'])  : '';
$mn  = isset($_GET['meetingNo']) ? (int)$_GET['meetingNo'] : 0;

if (!imperium_valid_id($cid) || $mn < 1 || $mn > 16) {
    json_error('Parameter courseId atau meetingNo tidak valid.', 400);
}

$id = $cid . '_m_' . $mn;
$pdo = imperium_db();

try {
    $stmt = $pdo->prepare('SELECT file_name, file_data FROM assignments WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
} catch (Exception $e) {
    json_error('Gagal mengambil file tugas.', 500, 'download: ' . $e->getMessage());
}

if (!$row) {
    json_error('File tugas tidak ditemukan di repository.', 404);
}

/* ---------- Validasi nama & isi sebelum dikirim ---------- */
$safeName = imperium_sanitize_filename((string)$row['file_name']);
if ($safeName === '') {
    json_error('Nama file tugas tidak valid.', 500);
}
$ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
if ($ext === '' || !in_array($ext, UPLOAD_ALLOWED_EXT, true)) {
    json_error('Tipe file tidak diizinkan untuk diunduh.', 403);
}

$content = (string)$row['file_data'];
if (!preg_match('/^data:([A-Za-z0-9.+\-\/]+);base64,([A-Za-z0-9+\/=\r\n]+)$/', $content, $m)) {
    json_error('Format penyimpanan file tidak dikenal.', 500);
}
$bytes = base64_decode(str_replace(["\r", "\n"], '', $m[2]), true);
if ($bytes === false || $bytes === '') {
    json_error('Isi file rusak.', 500);
}
if (strlen($bytes) > UPLOAD_MAX_BYTES) {
    json_error('Ukuran file melebihi batas yang diizinkan.', 413);
}

/* Verifikasi MIME nyata bila tersedia; hanya keluarga yang diizinkan. */
$mime = imperium_detect_mime($bytes);
$allowed = imperium_allowed_mime_prefixes($ext);
$ok = false;
foreach ($allowed as $prefix) {
    if (strpos($mime, $prefix) === 0) { $ok = true; break; }
}
if (!$ok) {
    json_error('Isi file tidak sesuai dengan tipe yang diizinkan.', 403);
}

/* ---------- Header pengunduhan ---------- */
$asciiName = preg_replace('/[^A-Za-z0-9._-]/', '_', $safeName) ?? 'tugas';
$utf8Name  = rawurlencode($safeName);
$type      = $mime;

header_remove('Content-Type');
header('Content-Type: ' . $type);
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: attachment; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . $utf8Name);
header('Content-Length: ' . strlen($bytes));
header('Cache-Control: private, max-age=0, must-revalidate');
header('Pragma: no-cache');

echo $bytes;
exit;
