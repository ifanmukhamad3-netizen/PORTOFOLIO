<?php
if (count(get_included_files()) === 1) {
    http_response_code(403);
    exit('Akses langsung dilarang.');
}

define('DB_DRIVER', 'mysql');
define('DB_HOST', 'HOST_MYSQL_DARI_PANEL');
define('DB_NAME', 'NAMA_DATABASE_DARI_PANEL');
define('DB_USER', 'USERNAME_DATABASE_DARI_PANEL');
define('DB_PASS', 'PASSWORD_DATABASE_DARI_PANEL');
define('SQLITE_PATH', __DIR__ . '/local.sqlite');
define('ADMIN_SETUP_KEY', 'BUAT_KUNCI_ACAK_PANJANG_UNTUK_SETUP_ADMIN');
