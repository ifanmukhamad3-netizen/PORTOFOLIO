<?php
/**
 * ============================================================================
 * IMPERIUM — ASSIGNMENT API (file tugas per pertemuan 1–16)
 * ----------------------------------------------------------------------------
 *   GET    api/assignment.php?list=1                          → metadata semua tugas (PUBLIK — Mode Dosen)
 *   GET    api/assignment.php?get=1&courseId=X&meetingNo=1    → isi satu tugas (PUBLIK — Mode Dosen)
 *   POST   api/assignment.php                                 → simpan/perbarui tugas (ADMIN + CSRF)
 *   DELETE api/assignment.php?courseId=X&meetingNo=1          → hapus tugas          (ADMIN + CSRF)
 *
 * Perubahan keamanan dari versi lama:
 *   - POST & DELETE kini WAJIB login Admin + token CSRF (sebelumnya terbuka).
 *   - Validasi nama file, ekstensi whitelist, ukuran maks 5 MB, isi base64,
 *     dan MIME nyata dari isi file (bukan sekadar ekstensi).
 *   - meetingNo wajib 1–16, courseId wajib ada di tabel courses.
 *   - Pesan error tidak lagi membocorkan pesan exception internal.
 *   - Query tetap prepared statement (INSERT ... ON DUPLICATE KEY UPDATE pada
 *     MySQL; padanan ON CONFLICT pada driver uji lokal SQLite).
 *
 * Unduh file: gunakan api/download.php?courseId=..&meetingNo=.. (publik).
 * Endpoint GET ?get=1 dipertahankan demi kompatibilitas perilaku lama.
 * ============================================================================
 */

require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

/* --------------------------------------------------------------- POST */
if ($method === 'POST') {
    $admin = require_admin_csrf();
    $pdo = imperium_db();
    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (strpos($contentType, 'multipart/form-data') === 0) {
        $body = $_POST;
        $upload = $_FILES['file'] ?? null;
        if (!is_array($upload) || (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $uploadError = is_array($upload) ? (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
            json_error(
                $uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE
                    ? 'Ukuran file melebihi batas upload server.'
                    : 'File tidak berhasil diterima oleh server.',
                $uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE ? 413 : 400
            );
        }
        $tmpName = (string)($upload['tmp_name'] ?? '');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            json_error('File upload tidak valid.', 400);
        }
        $bytes = file_get_contents($tmpName);
        if ($bytes === false) {
            json_error('File upload tidak dapat dibaca.', 400);
        }
        $body['name'] = (string)($upload['name'] ?? '');
        $body['content'] = 'data:application/octet-stream;base64,' . base64_encode($bytes);
    } else {
        $body = imperium_read_json_body();
    }

    /* Validasi menyeluruh (courseId, meetingNo 1–16, nama, ekstensi, ukuran, isi, MIME) */
    $file = imperium_validate_assignment_payload($body);
    $cid  = $file['courseId'];
    $mn   = $file['meetingNo'];

    /* Mata kuliah wajib sudah terdaftar di tabel courses (konsistensi repository). */
    try {
        $chk = $pdo->prepare('SELECT id FROM courses WHERE id = :cid LIMIT 1');
        $chk->execute([':cid' => $cid]);
        if (!$chk->fetch()) {
            json_error('Mata kuliah tidak ditemukan di repository. Daftarkan mata kuliahnya terlebih dahulu.', 400);
        }
    } catch (Exception $e) {
        json_error('Gagal memeriksa mata kuliah. Pastikan tabel sudah dibuat (database.sql).', 500, 'assignment POST check: ' . $e->getMessage());
    }

    $id       = $cid . '_m_' . $mn;
    $sizeText = $file['sizeLabel'];

    if (imperium_is_mysql()) {
        $sql = 'INSERT INTO assignments (id, course_id, meeting_no, file_name, file_size, file_data)
                VALUES (:id, :cid, :mn, :fn, :fs, :fd)
                ON DUPLICATE KEY UPDATE
                  file_name = VALUES(file_name),
                  file_size = VALUES(file_size),
                  file_data = VALUES(file_data)';
    } else {
        $sql = 'INSERT INTO assignments (id, course_id, meeting_no, file_name, file_size, file_data)
                VALUES (:id, :cid, :mn, :fn, :fs, :fd)
                ON CONFLICT DO UPDATE SET
                  file_name = excluded.file_name,
                  file_size = excluded.file_size,
                  file_data = excluded.file_data';
    }

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':id'  => $id,
            ':cid' => $cid,
            ':mn'  => $mn,
            ':fn'  => $file['fileName'],
            ':fs'  => $sizeText,
            ':fd'  => $file['dataUrl'],
        ]);
    } catch (Exception $e) {
        json_error('Gagal menyimpan tugas ke repository.', 500, 'assignment POST: ' . $e->getMessage());
    }

    json_out([
        'status'  => 'success',
        'message' => 'Tugas berhasil disimpan ke repository.',
        'data'    => [
            'id'        => $id,
            'courseId'  => $cid,
            'meetingNo' => $mn,
            'fileName'  => $file['fileName'],
            'fileSize'  => $sizeText,
            'by'        => $admin,
        ],
    ]);
}

/* -------------------------------------------------------------- DELETE */
if ($method === 'DELETE') {
    require_admin_csrf();
    $pdo = imperium_db();

    $cid = isset($_GET['courseId'])  ? trim((string)$_GET['courseId'])  : '';
    $mn  = isset($_GET['meetingNo']) ? (int)$_GET['meetingNo'] : 0;

    if (!imperium_valid_id($cid) || $mn < 1 || $mn > 16) {
        json_error('Parameter courseId atau meetingNo tidak valid.', 400);
    }

    $id = $cid . '_m_' . $mn;
    try {
        $stmt = $pdo->prepare('DELETE FROM assignments WHERE id = :id');
        $stmt->execute([':id' => $id]);
    } catch (Exception $e) {
        json_error('Gagal menghapus tugas dari repository.', 500, 'assignment DELETE: ' . $e->getMessage());
    }

    json_out(['status' => 'success', 'message' => 'Tugas berhasil dihapus dari repository.']);
}

/* ----------------------------------------------------------------- GET */
if ($method === 'GET') {
    $pdo = imperium_db();
    /* GET ?get=1 → isi satu tugas lengkap (dipakai jalur unduh lama & dosen). */
    if (isset($_GET['get']) && $_GET['get'] === '1') {
        $cid = isset($_GET['courseId'])  ? trim((string)$_GET['courseId'])  : '';
        $mn  = isset($_GET['meetingNo']) ? (int)$_GET['meetingNo'] : 0;

        if (!imperium_valid_id($cid) || $mn < 1 || $mn > 16) {
            json_error('Parameter courseId atau meetingNo tidak valid.', 400);
        }
        $id = $cid . '_m_' . $mn;
        try {
            $stmt = $pdo->prepare('SELECT course_id, meeting_no, file_name, file_size, file_data FROM assignments WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
        } catch (Exception $e) {
            json_error('Gagal mengambil data tugas.', 500, 'assignment GET(get): ' . $e->getMessage());
        }
        if (!$row) {
            json_error('Tugas tidak ditemukan di repository.', 404);
        }
        json_out(['status' => 'success', 'data' => [
            'courseId'  => $row['course_id'],
            'meetingNo' => (int)$row['meeting_no'],
            'fileName'  => $row['file_name'],
            'fileSize'  => $row['file_size'],
            'fileData'  => $row['file_data'],
        ]]);
    }

    /* GET ?list=1 (default) → metadata semua tugas, ringan, tanpa isi file. */
    try {
        $rows = $pdo->query(
            'SELECT id, course_id, meeting_no, file_name, file_size FROM assignments ORDER BY course_id ASC, meeting_no ASC'
        )->fetchAll();
    } catch (Exception $e) {
        json_error('Gagal mengambil daftar tugas.', 500, 'assignment GET(list): ' . $e->getMessage());
    }
    $data = array_map(static function (array $r): array {
        return [
            'id'        => $r['id'],
            'courseId'  => $r['course_id'],
            'meetingNo' => (int)$r['meeting_no'],
            'fileName'  => $r['file_name'],
            'fileSize'  => $r['file_size'],
        ];
    }, $rows);
    json_out(['status' => 'success', 'data' => $data]);
}

json_error('Method tidak didukung.', 405);
