<?php
/**
 * ============================================================================
 * IMPERIUM — INSTALL ADMIN (wizard sekali-pakai)
 * ----------------------------------------------------------------------------
 * Dipakai SATU KALI setelah deploy untuk membuat akun Admin pertama:
 *   1. Ganti ADMIN_SETUP_KEY di konfigurasi lingkungan.
 *   2. Upload file ini bersama website, jalankan database.sql di phpMyAdmin.
 *   3. Buka  https://domain-anda/api/install-admin.php  di browser.
 *   4. Isi kunci setup + username + password admin → klik "Buat Akun Admin".
 *   5. File ini MENGHAPUS DIRINYA SENDIRI otomatis setelah akun berhasil dibuat.
 *
 * Proteksi:
 *   - Menolak bila sudah ada akun admin (tidak bisa menimpa akun lama).
 *   - Kunci setup wajib sama dengan ADMIN_SETUP_KEY di config.php.
 *   - Maksimal 3 percobaan salah per session (dikunci 15 menit).
 *   - Token CSRF per session; password disimpan sebagai hash bcrypt.
 * ============================================================================
 */

require __DIR__ . '/config.php';

header_remove('Content-Type');
header('Content-Type: text/html; charset=utf-8');

$err = '';
$ok  = false;
$wizardRemoved = false;

function h(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

if (ADMIN_SETUP_KEY === 'GANTI_DENGAN_KUNCI_ACAK_PANJANG_SEBELUM_DEPLOY'
    || ADMIN_SETUP_KEY === 'BUAT_KUNCI_ACAK_PANJANG_UNTUK_SETUP_ADMIN'
    || ADMIN_SETUP_KEY === '') {
    http_response_code(503);
    echo '<!doctype html><meta charset="utf-8"><h1>Konfigurasi setup belum aman</h1>'
       . '<p>Atur ADMIN_SETUP_KEY pada konfigurasi lingkungan sebelum membuat Admin.</p>';
    exit;
}

try {
    $pdo = imperium_db();
    $count = (int)$pdo->query('SELECT COUNT(*) AS c FROM admin_users')->fetch()['c'];
} catch (Exception $e) {
    http_response_code(500);
    echo '<!doctype html><meta charset="utf-8"><body style="background:#0B0B0D;color:#E8E0D0;font-family:sans-serif;padding:2em">'
       . '<h1>Database belum siap</h1><p>Polakan tabel dulu dengan menjalankan <b>database.sql</b> di phpMyAdmin '
       . '(tabel <code>admin_users</code> belum ada), lalu muat ulang halaman ini.</p></body>';
    exit;
}

if ($count > 0) {
    echo '<!doctype html><meta charset="utf-8"><body style="background:#0B0B0D;color:#E8E0D0;font-family:sans-serif;padding:2em">'
       . '<h1>Akun admin sudah ada</h1><p>Database sudah memiliki akun admin, jadi wizard ini tidak bisa dipakai lagi. '
       . 'Untuk keamanan, <b>hapus file api/install-admin.php dari hosting sekarang</b> (jika masih ada).</p>'
       . '<p><a style="color:#C5A15A" href="../index.html">&larr; Kembali ke website</a></p></body>';
    exit;
}

$wait = 0;
$locked = $_SESSION['setup_lock_until'] ?? 0;
if ($locked > time()) {
    $wait = $locked - time();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $wait === 0) {
    $sentKey  = (string)($_POST['setup_key'] ?? '');
    $username = trim((string)($_POST['username'] ?? ''));
    $password = (string)($_POST['password'] ?? '');
    $confirm  = (string)($_POST['confirm'] ?? '');
    $csrf     = (string)($_POST['csrf'] ?? '');

    if (!hash_equals($_SESSION['imperium_csrf'] ?? '', $csrf)) {
        $err = 'Token keamanan kedaluwarsa — muat ulang halaman lalu coba lagi.';
        $_SESSION['setup_fails'] = (int)($_SESSION['setup_fails'] ?? 0) + 1;
    } elseif (!hash_equals(ADMIN_SETUP_KEY, $sentKey)) {
        $err = 'Kunci setup salah. Periksa ADMIN_SETUP_KEY pada konfigurasi lingkungan.';
        $_SESSION['setup_fails'] = (int)($_SESSION['setup_fails'] ?? 0) + 1;
    } elseif (!preg_match('/^[A-Za-z0-9_.-]{4,40}$/', $username)) {
        $err = 'Username 4–40 karakter, hanya huruf, angka, titik, garis bawah atau strip.';
    } elseif (strlen($password) < 8 || strlen($password) > 72) {
        $err = 'Password minimal 8 karakter (maksimal 72).';
    } elseif ($password !== $confirm) {
        $err = 'Konfirmasi password tidak sama.';
    } else {
        try {
            $stmt = $pdo->prepare('INSERT INTO admin_users (username, password_hash, updated_at)
                                   VALUES (:u, :p, ' . (imperium_is_mysql() ? 'NOW()' : "datetime('now')") . ')');
            $stmt->execute([':u' => $username, ':p' => password_hash($password, PASSWORD_DEFAULT)]);
            $ok = true;
            $wizardRemoved = @unlink(__FILE__);
            if (!$wizardRemoved) {
                error_log('[IMPERIUM] install-admin.php tidak dapat menghapus dirinya sendiri; hapus manual.');
            }
        } catch (Exception $e) {
            $err = 'Gagal membuat akun (username mungkin sudah dipakai atau database bermasalah).';
            error_log('[IMPERIUM] install-admin: ' . $e->getMessage());
        }
    }

    if ((int)($_SESSION['setup_fails'] ?? 0) >= 3) {
        $_SESSION['setup_lock_until'] = time() + 900;
        $_SESSION['setup_fails'] = 0;
        $err = 'Terlalu banyak percobaan salah. Wizard dikunci 15 menit.';
    }
}

$csrf = imperium_csrf_token();
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Setup Admin — IMPERIUM</title>
<style>
  :root { --gold:#C5A15A; --gold-bright:#E4C486; --bg:#0B0B0D; --panel:#171719; --ink:#E8E0D0; --muted:#A6A19A; --danger:#C1442D; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(1200px 600px at 50% -10%, #1d1a14, var(--bg)); color:var(--ink); font-family:'Segoe UI', system-ui, sans-serif; }
  .card { width:min(430px, 92vw); background:var(--panel); border:1px solid rgba(197,161,90,.35); border-radius:16px; padding:34px 30px; box-shadow:0 30px 80px rgba(0,0,0,.5); }
  h1 { font-size:1.25rem; letter-spacing:.14em; text-transform:uppercase; margin:0 0 4px; color:var(--gold); text-align:center; }
  p.lead { text-align:center; color:var(--muted); font-size:.85rem; margin:0 0 22px; }
  label { display:block; font-size:.8rem; color:var(--muted); margin:14px 0 6px; letter-spacing:.04em; }
  input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid rgba(197,161,90,.3); background:#101012; color:var(--ink); font-size:.95rem; }
  input:focus { outline:none; border-color:var(--gold); }
  button { width:100%; margin-top:22px; padding:12px; border:0; border-radius:8px; background:linear-gradient(180deg, var(--gold-bright), var(--gold)); color:#151004; font-weight:800; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  .err { background:rgba(193,68,45,.14); border:1px solid rgba(193,68,45,.5); color:#f0a08f; border-radius:8px; padding:10px 12px; font-size:.85rem; margin-top:14px; }
  .warn { background:rgba(197,161,90,.1); border:1px solid rgba(197,161,90,.4); border-radius:8px; padding:10px 12px; font-size:.8rem; color:var(--gold-bright); margin-top:14px; line-height:1.5; }
  a { color:var(--gold); }
  .ok-box { text-align:center; }
  .ok-box i { font-size:2.4rem; color:#7C9473; }
</style>
</head>
<body>
  <div class="card">
    <?php if ($ok): ?>
      <div class="ok-box">
        <div>&#x2714;</div>
        <h1 style="margin-top:10px;">Akun Admin Dibuat</h1>
        <p class="lead"><?= $wizardRemoved ? 'File wizard ini sudah dihapus dari hosting.' : 'Hapus file api/install-admin.php dari hosting sekarang.' ?></p>
        <div class="warn">Simpan username &amp; password Anda. Setelah ini login lewat halaman <b>Akademik &rarr; Admin</b>. Disarankan langsung menekan tombol <b>Ganti Password</b> di dashboard untuk memakai password pilihan Anda.</div>
        <p style="margin-top:18px;"><a href="../index.html">&#8592; Buka Website IMPERIUM</a></p>
      </div>
    <?php else: ?>
      <h1>Setup Akun Admin</h1>
      <p class="lead">Wizard sekali-pakai &mdash; hanya berlaku saat belum ada akun admin.</p>
      <?php if ($wait > 0): ?>
        <div class="err">Wizard dikunci karena terlalu banyak percobaan salah. Coba lagi dalam <?= (int)ceil($wait / 60) ?> menit.</div>
      <?php else: ?>
        <form method="post" autocomplete="off">
          <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
          <label>Kunci Setup (ADMIN_SETUP_KEY pada konfigurasi lingkungan)</label>
          <input type="password" name="setup_key" required placeholder="kunci setup">
          <label>Username Admin</label>
          <input type="text" name="username" required minlength="4" maxlength="40" placeholder="misalnya: ifan">
          <label>Password Baru (minimal 8 karakter)</label>
          <input type="password" name="password" required minlength="8" maxlength="72">
          <label>Konfirmasi Password</label>
          <input type="password" name="confirm" required minlength="8" maxlength="72">
          <button type="submit">Buat Akun Admin</button>
        </form>
        <?php if ($err !== ''): ?><div class="err"><?= h($err) ?></div><?php endif; ?>
        <div class="warn">Setelah akun berhasil dibuat, file ini menghapus dirinya sendiri. Jangan biarkan file wizard tersisa di hosting.</div>
      <?php endif; ?>
      <p style="margin-top:16px; text-align:center;"><a href="../index.html">&larr; Kembali ke website</a></p>
    <?php endif; ?>
  </div>
</body>
</html>
