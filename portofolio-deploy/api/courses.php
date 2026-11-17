<?php
/**
 * ============================================================================
 * IMPERIUM — COURSES API (mata kuliah per semester 1–8)
 * ----------------------------------------------------------------------------
 *   GET    api/courses.php                        → daftar semua mata kuliah (PUBLIK — Mode Dosen)
 *   POST   api/courses.php                        → tambah mata kuliah          (ADMIN + CSRF)
 *   PUT    api/courses.php                        → sunting mata kuliah         (ADMIN + CSRF)
 *   DELETE api/courses.php?id=...                 → hapus mata kuliah + arsip   (ADMIN + CSRF)
 *
 * Konvensi data:
 *   - id  : string aman [A-Za-z0-9_-] (maks 64). Bila tidak dikirim, server
 *           yang membuat ('c_' + waktu). id lama dari localStorage dipertahankan
 *           agar arsip tugas lama (assignments/meeting_meta) tetap tersambung.
 *   - DELETE menghapus juga assignments + meeting_meta milik mata kuliah itu
 *           (satu transaksi) supaya tidak ada arsip yatim yang menggantung.
 *   - Semua query memakai prepared statement.
 * ============================================================================
 */

require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

/* ------------------------------------------------- GET (PUBLIK / DOSEN) */
if ($method === 'GET') {
    try {
        $pdo = imperium_db();
        $rows = $pdo->query(
            'SELECT id, name, semester, class_code, description FROM courses ORDER BY semester ASC, name ASC'
        )->fetchAll();
    } catch (Exception $e) {
        json_error('Gagal mengambil daftar mata kuliah.', 500, 'courses GET: ' . $e->getMessage());
    }
    $data = array_map(static function (array $r): array {
        return [
            'id'          => $r['id'],
            'name'        => $r['name'],
            'semester'    => (int)$r['semester'],
            'classCode'   => $r['class_code'],
            'description' => (string)($r['description'] ?? ''),
        ];
    }, $rows);
    json_out(['status' => 'success', 'data' => $data]);
}

/* Bersihkan & validasi field mata kuliah (dipakai POST & PUT). */
function courses_clean_fields(array $in): array
{
    $name = isset($in['name']) ? trim(strip_tags((string)$in['name'])) : '';
    if ($name === '' || imperium_text_length($name) > 150) {
        json_error('Nama mata kuliah wajib diisi (maksimal 150 karakter).', 400);
    }
    $semester = isset($in['semester']) ? (int)$in['semester'] : 0;
    if ($semester < 1 || $semester > 8) {
        json_error('Semester harus di antara 1 sampai 8.', 400);
    }
    $classCode = isset($in['classCode']) ? trim(strip_tags((string)$in['classCode'])) : '';
    if ($classCode === '') {
        $classCode = 'TI24C';
    }
    if (imperium_text_length($classCode) > 40) {
        json_error('Kode kelas terlalu panjang (maksimal 40 karakter).', 400);
    }
    $description = isset($in['description']) ? trim(strip_tags((string)$in['description'])) : '';
    if (imperium_text_length($description) > 500) {
        json_error('Deskripsi terlalu panjang (maksimal 500 karakter).', 400);
    }
    return [$name, $semester, $classCode, $description];
}

/* -------------------------------------------------- POST (ADMIN + CSRF) */
if ($method === 'POST') {
    require_admin_csrf();
    $pdo = imperium_db();
    $body = imperium_read_json_body();

    /* id opsional: dipakai saat migrasi data lama dari localStorage. */
    $id = isset($body['id']) && $body['id'] !== '' ? trim((string)$body['id']) : 'c_' . dechex(time()) . bin2hex(random_bytes(3));
    if (!imperium_valid_id($id)) {
        json_error('ID mata kuliah tidak valid.', 400);
    }

    [$name, $semester, $classCode, $description] = courses_clean_fields($body);

    try {
        $exists = $pdo->prepare('SELECT id FROM courses WHERE id = :id LIMIT 1');
        $exists->execute([':id' => $id]);
        if ($exists->fetch()) {
            json_error('Mata kuliah dengan ID tersebut sudah ada di database.', 409);
        }
        $stmt = $pdo->prepare(
            'INSERT INTO courses (id, name, semester, class_code, description, created_at)
             VALUES (:id, :name, :semester, :class_code, :description, ' .
             (imperium_is_mysql() ? 'NOW()' : "datetime('now')") . ')'
        );
        $stmt->execute([
            ':id'          => $id,
            ':name'        => $name,
            ':semester'    => $semester,
            ':class_code'  => $classCode,
            ':description' => $description,
        ]);
    } catch (Exception $e) {
        json_error('Gagal menyimpan mata kuliah baru.', 500, 'courses POST: ' . $e->getMessage());
    }

    json_out([
        'status'  => 'success',
        'message' => 'Mata kuliah berhasil ditambahkan ke repository.',
        'data'    => ['id' => $id, 'name' => $name, 'semester' => $semester, 'classCode' => $classCode, 'description' => $description],
    ]);
}

/* --------------------------------------------------- PUT (ADMIN + CSRF) */
if ($method === 'PUT') {
    require_admin_csrf();
    $pdo = imperium_db();
    $body = imperium_read_json_body();

    $id = isset($body['id']) ? trim((string)$body['id']) : '';
    if (!imperium_valid_id($id)) {
        json_error('Parameter id tidak valid.', 400);
    }
    [$name, $semester, $classCode, $description] = courses_clean_fields($body);

    try {
        $stmt = $pdo->prepare(
            'UPDATE courses SET name = :name, semester = :semester, class_code = :class_code, description = :description WHERE id = :id'
        );
        $stmt->execute([
            ':name'        => $name,
            ':semester'    => $semester,
            ':class_code'  => $classCode,
            ':description' => $description,
            ':id'          => $id,
        ]);
        if ($stmt->rowCount() === 0) {
            $check = $pdo->prepare('SELECT id FROM courses WHERE id = :id LIMIT 1');
            $check->execute([':id' => $id]);
            if (!$check->fetch()) {
                json_error('Mata kuliah tidak ditemukan di database.', 404);
            }
        }
    } catch (Exception $e) {
        json_error('Gagal memperbarui mata kuliah.', 500, 'courses PUT: ' . $e->getMessage());
    }

    json_out([
        'status'  => 'success',
        'message' => 'Mata kuliah berhasil diperbarui.',
        'data'    => ['id' => $id, 'name' => $name, 'semester' => $semester, 'classCode' => $classCode, 'description' => $description],
    ]);
}

/* ------------------------------------------------ DELETE (ADMIN + CSRF) */
if ($method === 'DELETE') {
    require_admin_csrf();
    $pdo = imperium_db();

    $id = isset($_GET['id']) ? trim((string)$_GET['id']) : '';
    if (!imperium_valid_id($id)) {
        json_error('Parameter id tidak valid.', 400);
    }

    try {
        $pdo->beginTransaction();

        $delAssign = $pdo->prepare('DELETE FROM assignments WHERE course_id = :cid');
        $delAssign->execute([':cid' => $id]);

        $delMeta = $pdo->prepare('DELETE FROM meeting_meta WHERE course_id = :cid');
        $delMeta->execute([':cid' => $id]);

        $delCourse = $pdo->prepare('DELETE FROM courses WHERE id = :id');
        $delCourse->execute([':id' => $id]);

        $removed = $delCourse->rowCount() > 0;
        $pdo->commit();

        if (!$removed) {
            json_error('Mata kuliah tidak ditemukan di database.', 404);
        }
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_error('Gagal menghapus mata kuliah.', 500, 'courses DELETE: ' . $e->getMessage());
    }

    json_out([
        'status'  => 'success',
        'message' => 'Mata kuliah beserta seluruh arsip pertemuannya telah dihapus.',
        'data'    => ['id' => $id],
    ]);
}

json_error('Method tidak didukung.', 405);
