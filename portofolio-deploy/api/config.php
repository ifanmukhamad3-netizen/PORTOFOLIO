<?php
/**
 * ============================================================================
 * IMPERIUM — KONFIGURASI & LAPISAN KEAMANAN
 * ----------------------------------------------------------------------------
 * File ini di-require oleh semua endpoint api/*.php. Berisi:
 *   1. Memuat konfigurasi terpisah untuk XAMPP atau InfinityFree
 *   2. Penguatan session PHP (cookie HttpOnly, SameSite, strict mode)
 *   3. Helper JSON + pesan error yang TIDAK membocorkan detail internal
 *   4. Autentikasi Admin (session) + verifikasi token CSRF
 *   5. Rate limit percobaan login gagal
 *   6. Validasi upload (nama file, ekstensi, ukuran, isi base64 + MIME nyata)
 *
 * CATATAN KEAMANAN:
 *   - Jangan pernah membagikan file konfigurasi lingkungan.
 *   - Akses langsung dari browser ke file ini diblokir otomatis (guard bawah)
 *     dan juga oleh .htaccess.
 * ============================================================================
 */

declare(strict_types=1);

/* ------------------------------------------------------------------ GUARD */
/* File konfigurasi tidak boleh diakses langsung dari browser.
   Jika file ini dieksekusi tanpa di-include endpoint lain → 403. */
if (count(get_included_files()) === 1) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Akses langsung ke file konfigurasi dilarang.');
}

/* Tolak body POST yang jelas berlebihan sebelum session/header dibuat. */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 7 * 1024 * 1024) {
    http_response_code(413);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    exit(json_encode(['status' => 'error', 'message' => 'Ukuran permintaan terlalu besar. Maksimal 5 MB per file.']));
}

if (function_exists('ini_set')) {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

/* ====================================================== 1. ENVIRONMENT */
$imperiumHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
$imperiumHost = trim((string)preg_replace('/:\d+$/', '', $imperiumHost), '[]');
$imperiumIsLocal = in_array($imperiumHost, ['localhost', '127.0.0.1', '::1'], true);
$imperiumConfigFile = __DIR__ . ($imperiumIsLocal ? '/config.local.php' : '/config.infinityfree.php');

if (!is_file($imperiumConfigFile)) {
    error_log('[IMPERIUM] File konfigurasi lingkungan tidak ditemukan: ' . basename($imperiumConfigFile));
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode(['status' => 'error', 'message' => 'Konfigurasi aplikasi belum tersedia.']));
}
require $imperiumConfigFile;

if (!defined('DB_DRIVER') || !in_array(DB_DRIVER, ['mysql', 'sqlite'], true)
    || !defined('DB_HOST') || !defined('DB_NAME') || !defined('DB_USER') || !defined('DB_PASS')
    || !defined('ADMIN_SETUP_KEY')) {
    error_log('[IMPERIUM] Konfigurasi lingkungan tidak lengkap.');
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode(['status' => 'error', 'message' => 'Konfigurasi aplikasi belum lengkap.']));
}

/* ====================================================== 2. BATAS UPLOAD */
define('UPLOAD_MAX_BYTES', 5 * 1024 * 1024); // 5 MB per file (ukuran nyata setelah decode base64)
define('UPLOAD_MAX_NAME', 200);

/* Ekstensi yang diizinkan untuk file tugas (whitelist). */
define('UPLOAD_ALLOWED_EXT', [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'txt', 'md', 'csv', 'zip', 'rar',
    'jpg', 'jpeg', 'png', 'webp',
]);

/* ====================================================== 3. SESSION AMAN */
if (session_status() === PHP_SESSION_NONE) {
    if (function_exists('ini_set')) {
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
    }
    session_name('IMPERIUMSESS');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/* Header respons umum. TANPA Access-Control-Allow-Origin: * — semua fetch
 * dilakukan same-origin, sehingga wildcard CORS justru melemahkan keamanan. */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

/* ====================================================== 4. DATABASE PDO */
/**
 * Koneksi PDO. Pesan gagal koneksi TIDAK pernah dikirim ke client
 * (hanya dicatat ke error log server) agar kredensial tidak bocor.
 */
function imperium_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];

    try {
        if (DB_DRIVER === 'sqlite') {
            $pdo = new PDO('sqlite:' . SQLITE_PATH, null, null, $options);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 5000');
        } else {
            $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        }
    } catch (PDOException $e) {
        error_log('[IMPERIUM] Koneksi database gagal: ' . $e->getMessage());
        json_error('Koneksi database gagal. Periksa konfigurasi database dan jalankan database.sql.', 500);
    }

    return $pdo;
}

/** TRUE bila driver saat ini adalah MySQL (InfinityFree), FALSE bila sqlite uji lokal. */
function imperium_is_mysql(): bool
{
    return DB_DRIVER === 'mysql';
}

/* ====================================================== 5. RESPONS JSON */
function json_out(array $payload, int $httpCode = 200): void
{
    http_response_code($httpCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Error AMAN untuk client: hanya pesan generik yang boleh tampil.
 * Detail teknis ($internalDetail) hanya dicatat ke error log server —
 * jangan pernah memasukkan password/kredensial ke $clientMessage.
 */
function json_error(string $clientMessage, int $httpCode, ?string $internalDetail = null): void
{
    if ($internalDetail !== null) {
        error_log('[IMPERIUM] ' . basename($_SERVER['SCRIPT_NAME'] ?? 'api') . ': ' . $internalDetail);
    }
    json_out(['status' => 'error', 'message' => $clientMessage], $httpCode);
}

/* ====================================================== 6. ADMIN & CSRF */
/** Token CSRF milik session ini (dibuat sekali, dipakai selama session hidup). */
function imperium_csrf_token(): string
{
    if (empty($_SESSION['imperium_csrf'])) {
        $_SESSION['imperium_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['imperium_csrf'];
}

/** Token CSRF dari header permintaan (fetch mengirim X-CSRF-Token). */
function imperium_request_csrf(): string
{
    return (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_SERVER['HTTP_X_CSRF'] ?? ''));
}

/** Wajib sudah login sebagai Admin, selain itu tolak 401. */
function require_admin(): string
{
    $user = $_SESSION['imperium_admin'] ?? '';
    if (!is_string($user) || $user === '') {
        json_error('Autentikasi Admin diperlukan. Silakan login terlebih dahulu.', 401);
    }
    return $user;
}

/** Wajib token CSRF cocok, selain itu tolak 403 (dipakai untuk POST/PUT/DELETE). */
function require_csrf(): void
{
    $sent = imperium_request_csrf();
    $own  = $_SESSION['imperium_csrf'] ?? '';
    if ($own === '' || $sent === '' || !hash_equals($own, $sent)) {
        json_error('Token keamanan (CSRF) tidak valid atau kedaluwarsa. Muat ulang halaman lalu coba lagi.', 403);
    }
}

/** Gabungan yang sering dipakai: hanya Admin yang sudah login + CSRF valid. */
function require_admin_csrf(): string
{
    $user = require_admin();
    require_csrf();
    return $user;
}

/* ====================================================== 7. RATE LIMIT LOGIN */
/** TRUE bila login sedang dikunci karena terlalu banyak percobaan gagal. */
function imperium_login_locked(int &$waitSeconds = 0): bool
{
    $lockUntil = (int)($_SESSION['login_lock_until'] ?? 0);
    if ($lockUntil > time()) {
        $waitSeconds = $lockUntil - time();
        return true;
    }
    if ($lockUntil > 0 && $lockUntil <= time()) {
        unset($_SESSION['login_lock_until'], $_SESSION['login_fails']); // kunci kedaluwarsa
    }
    return false;
}

function imperium_login_fail(): void
{
    $_SESSION['login_fails'] = (int)($_SESSION['login_fails'] ?? 0) + 1;
    if ($_SESSION['login_fails'] >= 5) {
        $_SESSION['login_lock_until'] = time() + 600; // kunci 10 menit
        $_SESSION['login_fails'] = 0;
    }
}

function imperium_login_ok(): void
{
    unset($_SESSION['login_fails'], $_SESSION['login_lock_until']);
}

/* ====================================================== 8. VALIDASI INPUT */
/** ID aman (courseId dsb.): hanya huruf, angka, '-', '_'; maksimal 64 karakter. */
function imperium_valid_id(string $id): bool
{
    return (bool)preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id);
}

/** Body JSON dari permintaan; gagal → 400. */
function imperium_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        json_error('Body permintaan kosong.', 400);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('Format JSON tidak valid.', 400);
    }
    return $data;
}

/** Bersihkan nama file: buang jalur/ direktori, karakter berbahaya & kontrol. */
function imperium_sanitize_filename(string $name): string
{
    $name = str_replace(['\\', '/'], '_', $name);
    $name = basename($name);
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    $name = trim(strip_tags($name), ". \t\n\r\0\x0B");
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, UPLOAD_MAX_NAME, 'UTF-8');
    } else {
        $name = substr($name, 0, UPLOAD_MAX_NAME);
    }
    return $name;
}

/** Keluarga MIME yang boleh untuk tiap ekstensi (dicocokkan dengan finfo). */
function imperium_allowed_mime_prefixes(string $ext): array
{
    switch ($ext) {
        case 'pdf':  return ['application/pdf'];
        case 'doc':  return ['application/msword', 'application/vnd.ms-office', 'application/cdfv2', 'application/x-ole-storage'];
        case 'docx':
        case 'xlsx':
        case 'pptx':
        case 'zip':  return ['application/zip', 'application/x-zip', 'application/vnd.openxmlformats-officedocument', 'application/octet-stream'];
        case 'xls':  return ['application/vnd.ms-excel', 'application/vnd.ms-office', 'application/x-ole-storage', 'application/cdfv2', 'application/zip', 'application/octet-stream'];
        case 'ppt':  return ['application/vnd.ms-powerpoint', 'application/vnd.ms-office', 'application/x-ole-storage', 'application/cdfv2', 'application/zip', 'application/octet-stream'];
        case 'rar':  return ['application/x-rar', 'application/vnd.rar', 'application/octet-stream'];
        case 'txt':
        case 'md':   return ['text/plain', 'text/x-', 'text/markdown', 'application/json'];
        case 'csv':  return ['text/plain', 'text/csv', 'text/x-', 'application/csv', 'application/vnd.ms-excel'];
        case 'jpg':
        case 'jpeg': return ['image/jpeg'];
        case 'png':  return ['image/png'];
        case 'webp': return ['image/webp'];
        default:     return [];
    }
}

function imperium_text_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    preg_match_all('/./us', $value, $matches);
    return count($matches[0]);
}

function imperium_text_substr(string $value, int $start, int $length): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, $start, $length, 'UTF-8');
    }
    preg_match_all('/./us', $value, $matches);
    return implode('', array_slice($matches[0], $start, $length));
}

function imperium_detect_mime(string $bytes): string
{
    if (!function_exists('finfo_open')) {
        json_error('Server tidak mendukung verifikasi tipe file.', 500);
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo === false) {
        json_error('Server tidak dapat memverifikasi tipe file.', 500);
    }
    $mime = finfo_buffer($finfo, $bytes);
    finfo_close($finfo);
    if (!is_string($mime) || $mime === '') {
        json_error('Tipe file tidak dapat diverifikasi.', 400);
    }
    return strtolower($mime);
}

/**
 * Validasi payload upload lengkap (tugas baru/penggantian).
 * $input harus punya: courseId, meetingNo, name, content.
 * Mengembalikan data bersih & terverifikasi, atau menolak dengan pesan aman.
 */
function imperium_validate_assignment_payload(array $input): array
{
    $courseId  = isset($input['courseId'])  ? trim((string)$input['courseId'])  : '';
    $meetingNo = isset($input['meetingNo']) ? (int)$input['meetingNo'] : 0;
    $fileName  = isset($input['name'])      ? (string)$input['name']   : '';
    $content   = isset($input['content'])   ? (string)$input['content'] : '';

    if ($courseId === '' || !imperium_valid_id($courseId)) {
        json_error('Parameter courseId tidak valid.', 400);
    }
    if ($meetingNo < 1 || $meetingNo > 16) {
        json_error('Nomor pertemuan harus di antara 1 sampai 16.', 400);
    }

    /* --- Nama file --- */
    $safeName = imperium_sanitize_filename($fileName);
    if ($safeName === '') {
        json_error('Nama file tugas tidak valid.', 400);
    }
    $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
    if ($ext === '' || !in_array($ext, UPLOAD_ALLOWED_EXT, true)) {
        json_error('Tipe file tidak diizinkan. Ekstensi yang diizinkan: ' . implode(', ', UPLOAD_ALLOWED_EXT) . '.', 400);
    }

    /* --- Isi file (base64 data URL) --- */
    if (!preg_match('/^data:([A-Za-z0-9.+\-\/]+);base64,([A-Za-z0-9+\/=\r\n]+)$/', $content, $m)) {
        json_error('Format isi file tidak valid (harus data URL base64).', 400);
    }
    $bytes = base64_decode(str_replace(["\r", "\n"], '', $m[2]), true);
    if ($bytes === false || $bytes === '') {
        json_error('Isi file tidak dapat dibaca (base64 rusak).', 400);
    }
    if (strlen($bytes) > UPLOAD_MAX_BYTES) {
        json_error('Ukuran file melebihi batas maksimal 5 MB.', 413);
    }

    /* --- Verifikasi MIME nyata dari isi file, bukan sekadar ekstensi --- */
    $mime = imperium_detect_mime($bytes);
    $allowed = imperium_allowed_mime_prefixes($ext);
    $ok = false;
    foreach ($allowed as $prefix) {
        if (strpos($mime, $prefix) === 0) { $ok = true; break; }
    }
    if (!$ok) {
        json_error('Isi file tidak sesuai dengan tipe file yang diunggah.', 400);
    }

    return [
        'courseId'  => $courseId,
        'meetingNo' => $meetingNo,
        'fileName'  => $safeName,
        'ext'       => $ext,
        'bytes'     => $bytes,
        'mime'      => $mime,
        'sizeLabel' => imperium_format_bytes(strlen($bytes)),
        'dataUrl'   => 'data:' . $mime . ';base64,' . base64_encode($bytes),
    ];
}

/* ====================================================== 9. UTILITAS */
function imperium_format_bytes(int $n): string
{
    if ($n < 1024)     return $n . ' B';
    if ($n < 1048576)  return round($n / 1024, 2) . ' KB';
    return round($n / 1048576, 2) . ' MB';
}

/** TRUE bila request ini memakai metode yang mengubah data. */
function imperium_is_mutation(string $method): bool
{
    return in_array(strtoupper($method), ['POST', 'PUT', 'PATCH', 'DELETE'], true);
}
