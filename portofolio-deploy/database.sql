-- ============================================================================
-- IMPERIUM — STRUKTUR DATABASE MySQL (InfinityFree)
-- ----------------------------------------------------------------------------
-- Cara pakai : Control Panel InfinityFree → phpMyAdmin → pilih database Anda
--              → tab "SQL" → tempel SELURUH isi file ini → tombol "Go/Import".
--
-- AMAN DIJALANKAN BERKALI-KALI: semua tabel memakai CREATE TABLE IF NOT EXISTS,
-- jadi data lama TIDAK akan terhapus atau ditimpa. Tabel lama (assignments,
-- meeting_meta) tidak diubah strukturnya — hanya DITAMBAHKAN 2 tabel baru:
--   1. admin_users  → akun login Admin (username + password ter-hash bcrypt)
--   2. courses      → daftar mata kuliah per semester (sumber konsisten
--                     untuk Admin & Mode Dosen di semua perangkat)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABEL LAMA (1/2): tugas pertemuan — setara tabel `assignments` di app.py Flask
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    id         VARCHAR(120)  NOT NULL,          -- "{courseId}_m_{meetingNo}"
    course_id  VARCHAR(120)  NOT NULL,
    meeting_no INT           NOT NULL,
    file_name  VARCHAR(255)  NOT NULL,
    file_size  VARCHAR(50)   NOT NULL,
    file_data  LONGTEXT      NOT NULL,          -- isi file dalam bentuk base64 data URL
    PRIMARY KEY (id),
    UNIQUE KEY uniq_course_meeting (course_id, meeting_no),
    KEY idx_assignments_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- TABEL LAMA (2/2): metadata pertemuan 1-16 (judul materi, deskripsi, catatan,
-- status selesai)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_meta (
    id          VARCHAR(120)  NOT NULL,         -- "{courseId}_m_{meetingNo}"
    course_id   VARCHAR(120)  NOT NULL,
    meeting_no  INT           NOT NULL,
    title       VARCHAR(200)  NULL,
    description TEXT          NULL,
    notes       TEXT          NULL,
    done        TINYINT(1)    NOT NULL DEFAULT 0,
    updated_at  DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_mm_course_meeting (course_id, meeting_no),
    KEY idx_mm_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- TABEL BARU (1/2): akun Admin pemilik website.
-- Password TIDAK pernah disimpan sebagai teks biasa — hanya hash dari PHP
-- password_hash(). Akun pertama dibuat melalui api/install-admin.php.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    username      VARCHAR(60)   NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,
    updated_at    DATETIME      NULL,
    PRIMARY KEY (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- TABEL BARU (2/2): mata kuliah per semester (Semester 1–8).
-- Sekarang mata kuliah tersimpan di DATABASE (bukan hanya localStorage), sehingga:
--   - Admin dapat mengelola dari perangkat mana pun,
--   - Mode Dosen dapat melihat SEMUA mata kuliah tanpa login,
--   - tugas (assignments) & materi (meeting_meta) tetap terhubung lewat course_id.
-- Kolom id boleh mengikuti id lama di localStorage (mis. "c1", "c_1710000000")
-- agar arsip tugas lama tetap tersambung tanpa migrasi data.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id          VARCHAR(64)   NOT NULL,
    name        VARCHAR(150)  NOT NULL,
    semester    TINYINT       NOT NULL DEFAULT 1,   -- 1..8
    class_code  VARCHAR(40)   NOT NULL DEFAULT 'TI24C',
    description VARCHAR(500)  NULL,
    created_at  DATETIME      NULL,
    PRIMARY KEY (id),
    KEY idx_courses_semester (semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mata kuliah starter yang sudah dipakai frontend lama. INSERT IGNORE menjaga
-- data yang telah ada dan memudahkan Mode Dosen tampil setelah instalasi baru.
INSERT IGNORE INTO courses (id, name, semester, class_code, description, created_at) VALUES
('c1', 'Agama', 1, 'TI24C', '', NOW()),
('c2', 'Logika Matematika', 1, 'TI24C', '', NOW()),
('c3', 'Pancasila', 1, 'TI24C', '', NOW()),
('c4', 'Matematika', 1, 'TI24C', '', NOW()),
('c5', 'Pengantar Teknologi Informasi', 1, 'TI24C', '', NOW()),
('c6', 'Pengantar Teknologi Informasi II', 1, 'TI24C', '', NOW()),
('c7', 'Fisika', 1, 'TI24C', '', NOW()),
('c8', 'Dasar Algoritma dan Pemrograman', 1, 'TI24C', '', NOW()),
('c9', 'Bahasa Inggris (Reading for Concepts)', 1, 'TI24C', '', NOW()),
('c10', 'Kewarganegaraan', 2, 'TI24C', '', NOW());
