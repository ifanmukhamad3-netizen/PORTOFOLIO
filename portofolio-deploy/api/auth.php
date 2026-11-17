<?php
/**
 * ============================================================================
 * IMPERIUM — AUTH API (autentikasi Admin + CSRF)
 * ----------------------------------------------------------------------------
 *   GET  api/auth.php?action=me               → status login + token CSRF
 *   POST api/auth.php?action=login            → login {username, password}
 *   POST api/auth.php?action=logout           → logout (akhiri session)
 *   POST api/auth.php?action=change-password  → ganti password admin
 *
 * Keamanan:
 *   - Password diverifikasi dari tabel admin_users memakai password_verify()
 *     (hash bcrypt, prepared statement).
 *   - Rate limit: 5 percobaan gagal → dikunci 10 menit per session.
 *   - Setelah login sukses, session ID di-regenerate (anti session fixation)
 *     dan token CSRF baru diterbitkan.
 *   - Pesan error tidak membocorkan detail internal.
 * ============================================================================
 */

require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? (string)$_GET['action'] : '';

/* ------------------------------------------------------------------ ME */
if ($method === 'GET' && $action === 'me') {
    $authed = !empty($_SESSION['imperium_admin']);
    json_out([
        'status' => 'success',
        'data'   => [
            'authenticated' => $authed,
            'username'      => $authed ? $_SESSION['imperium_admin'] : null,
            'csrfToken'     => $authed ? imperium_csrf_token() : null,
        ],
    ]);
}

/* --------------------------------------------------------------- LOGIN */
if ($method === 'POST' && $action === 'login') {
    $wait = 0;
    if (imperium_login_locked($wait)) {
        json_error('Terlalu banyak percobaan login gagal. Coba lagi dalam ' . max(1, (int)ceil($wait / 60)) . ' menit.', 429);
    }

    $body     = imperium_read_json_body();
    $username = isset($body['username']) ? trim((string)$body['username']) : '';
    $password = isset($body['password']) ? (string)$body['password'] : '';

    if ($username === '' || $password === '') {
        json_error('Username dan password wajib diisi.', 400);
    }
    if (strlen($username) > 60 || strlen($password) > 72) {
        json_error('Username atau password tidak valid.', 401);
    }

    $pdo = imperium_db();
    try {
        $stmt = $pdo->prepare('SELECT username, password_hash FROM admin_users WHERE username = :u LIMIT 1');
        $stmt->execute([':u' => $username]);
        $row = $stmt->fetch();
    } catch (Exception $e) {
        json_error('Gagal memproses login. Periksa bahwa tabel database sudah dibuat (database.sql).', 500, 'login query: ' . $e->getMessage());
    }

    // Verifikasi (prepared statement). Pesan gagal identik agar tidak mudah
    // menebak username mana yang terdaftar (anti user-enumeration).
    $ok = $row && is_string($row['password_hash'] ?? null) && password_verify($password, $row['password_hash']);

    if (!$ok) {
        imperium_login_fail();
        usleep(300000); // perlambat brute force
        json_error('Username atau password salah.', 401);
    }

    // Cek apakah hash perlu di-rehash (mis. standar PHP berubah) — opsional, aman.
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        try {
            $newHash = password_hash($password, PASSWORD_DEFAULT);
            // SQL disusun dulu (driver dipilih sebelum prepare) — SQLite menolak
            // fungsi MySQL seperti NOW() pada tahap prepare.
            $upd = $pdo->prepare('UPDATE admin_users SET password_hash = :p, updated_at = ' .
                (imperium_is_mysql() ? 'NOW()' : "datetime('now')") . ' WHERE username = :u');
            $upd->execute([':p' => $newHash, ':u' => $username]);
        } catch (Exception $e) {
            error_log('[IMPERIUM] rehash gagal: ' . $e->getMessage()); // tidak fatal
        }
    }

    // Sukses: regenerasi session ID (anti session fixation), set identitas + CSRF baru.
    imperium_login_ok();
    session_regenerate_id(true);
    $_SESSION['imperium_admin'] = (string)$row['username'];
    unset($_SESSION['imperium_csrf']);
    $token = imperium_csrf_token();

    json_out([
        'status'  => 'success',
        'message' => 'Login berhasil. Selamat datang, ' . $row['username'] . '.',
        'data'    => ['authenticated' => true, 'username' => $row['username'], 'csrfToken' => $token],
    ]);
}

/* -------------------------------------------------------------- LOGOUT */
if ($method === 'POST' && $action === 'logout') {
    if (!empty($_SESSION['imperium_admin'])) {
        require_csrf();
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    json_out(['status' => 'success', 'message' => 'Logout berhasil.']);
}

/* ----------------------------------------------------- CHANGE PASSWORD */
if ($method === 'POST' && $action === 'change-password') {
    $user = require_admin_csrf();
    $pdo = imperium_db();

    $body    = imperium_read_json_body();
    $current = isset($body['currentPassword']) ? (string)$body['currentPassword'] : '';
    $new     = isset($body['newPassword'])     ? (string)$body['newPassword']     : '';

    if (strlen($current) > 72 || strlen($new) > 72) {
        json_error('Password tidak valid.', 400);
    }
    if (strlen($new) < 8) {
        json_error('Password baru minimal 8 karakter.', 400);
    }

    try {
        $stmt = $pdo->prepare('SELECT password_hash FROM admin_users WHERE username = :u LIMIT 1');
        $stmt->execute([':u' => $user]);
        $row = $stmt->fetch();
    } catch (Exception $e) {
        json_error('Gagal memproses permintaan.', 500, 'change-password query: ' . $e->getMessage());
    }
    if (!$row || !password_verify($current, $row['password_hash'])) {
        json_error('Password lama tidak sesuai.', 401);
    }

    $newHash = password_hash($new, PASSWORD_DEFAULT);
    try {
        // SQL disusun dulu (driver dipilih sebelum prepare) — SQLite menolak
        // fungsi MySQL seperti NOW() pada tahap prepare.
        $upd = $pdo->prepare('UPDATE admin_users SET password_hash = :p, updated_at = ' .
            (imperium_is_mysql() ? 'NOW()' : "datetime('now')") . ' WHERE username = :u');
        $upd->execute([':p' => $newHash, ':u' => $user]);
    } catch (Exception $e) {
        json_error('Gagal menyimpan password baru.', 500, 'change-password update: ' . $e->getMessage());
    }

    session_regenerate_id(true);
    unset($_SESSION['imperium_csrf']);
    $token = imperium_csrf_token();

    json_out([
        'status'  => 'success',
        'message' => 'Password berhasil diganti.',
        'data'    => ['username' => $user, 'csrfToken' => $token],
    ]);
}

json_error('Method atau action tidak didukung.', 405);
