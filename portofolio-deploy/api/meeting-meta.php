<?php
/**
 * ============================================================================
 * IMPERIUM — MEETING META API (materi pertemuan 1–16: judul, deskripsi,
 * catatan, status selesai)
 * ----------------------------------------------------------------------------
 *   GET  api/meeting-meta.php?list=1   → metadata semua pertemuan (PUBLIK — Mode Dosen)
 *   POST api/meeting-meta.php          → simpan metadata satu pertemuan (ADMIN + CSRF)
 *
 * Perubahan keamanan dari versi lama:
 *   - POST kini WAJIB login Admin + token CSRF (sebelumnya terbuka untuk publik).
 *   - Validasi courseId, meetingNo 1–16, dan panjang tiap teks.
 *   - Pesan error tidak membocorkan detail internal; query tetap prepared statement.
 * ============================================================================
 */

require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

/* --------------------------------------------------------------- POST */
if ($method === 'POST') {
    require_admin_csrf();
    $pdo = imperium_db();
    $body = imperium_read_json_body();

    $cid = isset($body['courseId'])  ? trim((string)$body['courseId'])  : '';
    $mn  = isset($body['meetingNo']) ? (int)$body['meetingNo'] : 0;

    if (!imperium_valid_id($cid)) {
        json_error('Parameter courseId tidak valid.', 400);
    }
    if ($mn < 1 || $mn > 16) {
        json_error('Nomor pertemuan harus di antara 1 sampai 16.', 400);
    }

    $title = isset($body['title']) ? imperium_text_substr(trim(strip_tags((string)$body['title'])), 0, 200)  : '';
    $desc  = isset($body['desc'])  ? imperium_text_substr(trim(strip_tags((string)$body['desc'])),  0, 2000) : '';
    $notes = isset($body['notes']) ? imperium_text_substr(trim(strip_tags((string)$body['notes'])), 0, 2000) : '';
    $done  = !empty($body['done']) ? 1 : 0;

    /* Mata kuliah wajib sudah ada (konsistensi repository). */
    try {
        $chk = $pdo->prepare('SELECT id FROM courses WHERE id = :cid LIMIT 1');
        $chk->execute([':cid' => $cid]);
        if (!$chk->fetch()) {
            json_error('Mata kuliah tidak ditemukan di repository.', 400);
        }
    } catch (Exception $e) {
        json_error('Gagal memeriksa mata kuliah.', 500, 'meta POST check: ' . $e->getMessage());
    }

    $id = $cid . '_m_' . $mn;

    if (imperium_is_mysql()) {
        $sql = 'INSERT INTO meeting_meta (id, course_id, meeting_no, title, description, notes, done, updated_at)
                VALUES (:id, :cid, :mn, :title, :description, :notes, :done, NOW())
                ON DUPLICATE KEY UPDATE
                  title = VALUES(title),
                  description = VALUES(description),
                  notes = VALUES(notes),
                  done = VALUES(done),
                  updated_at = NOW()';
    } else {
        $sql = 'INSERT INTO meeting_meta (id, course_id, meeting_no, title, description, notes, done, updated_at)
                VALUES (:id, :cid, :mn, :title, :description, :notes, :done, datetime(\'now\'))
                ON CONFLICT DO UPDATE SET
                  title = excluded.title,
                  description = excluded.description,
                  notes = excluded.notes,
                  done = excluded.done,
                  updated_at = datetime(\'now\')';
    }

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':id'          => $id,
            ':cid'         => $cid,
            ':mn'          => $mn,
            ':title'       => $title,
            ':description' => $desc,
            ':notes'       => $notes,
            ':done'        => $done,
        ]);
    } catch (Exception $e) {
        json_error('Gagal menyimpan materi pertemuan.', 500, 'meta POST: ' . $e->getMessage());
    }

    json_out(['status' => 'success', 'message' => 'Materi pertemuan tersimpan ke repository.']);
}

/* ----------------------------------------------------------------- GET */
if ($method === 'GET') {
    try {
        $pdo = imperium_db();
        $rows = $pdo->query(
            'SELECT course_id, meeting_no, title, description, notes, done FROM meeting_meta ORDER BY course_id ASC, meeting_no ASC'
        )->fetchAll();
    } catch (Exception $e) {
        json_error('Gagal mengambil materi pertemuan.', 500, 'meta GET: ' . $e->getMessage());
    }
    $data = array_map(static function (array $r): array {
        return [
            'courseId'  => $r['course_id'],
            'meetingNo' => (int)$r['meeting_no'],
            'title'     => (string)($r['title'] ?? ''),
            'desc'      => (string)($r['description'] ?? ''),
            'notes'     => (string)($r['notes'] ?? ''),
            'done'      => (bool)$r['done'],
        ];
    }, $rows);
    json_out(['status' => 'success', 'data' => $data]);
}

json_error('Method tidak didukung.', 405);
