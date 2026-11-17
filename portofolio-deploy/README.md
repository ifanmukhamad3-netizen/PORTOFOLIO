# IMPERIUM — The Digital Empire

Portofolio akademik dengan identitas Roman dark-luxury, marmer, pilar, aksen emas,
animasi sinematik, dan Academic Repository untuk Admin serta Mode Dosen.

## Fitur

- Login Admin berbasis PHP session, hash password, pembatasan percobaan, dan CSRF.
- Mode Dosen publik hanya-baca: melihat semester, mata kuliah, pertemuan, materi,
  dan mengunduh tugas.
- CRUD mata kuliah dan arsip tugas; setiap mata kuliah memiliki 16 pertemuan.
- Upload multipart maksimal 5 MiB dengan whitelist ekstensi dan pemeriksaan MIME.
- Proyek dan foto profil tetap disimpan di browser seperti implementasi sebelumnya.
- GSAP, ScrollTrigger, dan Lenis tersedia lokal di `vendor/`; font dan ikon memakai CDN.

## Persyaratan

- PHP 8.0+ dengan Apache, session, PDO MySQL, dan ekstensi Fileinfo.
- MySQL/MariaDB dengan dukungan InnoDB dan `utf8mb4`.
- XAMPP untuk menjalankan aplikasi lokal. Membuka `index.html` lewat `file://` atau
  Live Server tidak menjalankan PHP API.

## Struktur penting

```text
index.html, style.css, script.js, cinema.js
api/
  config.php                    Pemilih konfigurasi dan helper keamanan/API
  config.local.php              Pengaturan default XAMPP
  config.infinityfree.php       Kredensial hosting (isi sendiri; rahasiakan)
  config.example.php            Contoh bentuk konfigurasi
  auth.php                      Login, logout, status session, ganti password
  courses.php                   CRUD mata kuliah
  assignment.php                Upload/list/detail/hapus tugas
  meeting-meta.php              Materi pertemuan
  download.php                  Unduhan tervalidasi
  install-admin.php             Wizard satu-kali akun Admin
database.sql                    Skema MySQL idempotent dan 10 starter courses
.htaccess                       Perlindungan file sensitif dan directory listing
vendor/                         Library animasi lokal
PANDUAN-DEPLOY-INFINITYFREE.md  Panduan XAMPP dan InfinityFree
```

## Menjalankan di XAMPP

1. Salin folder proyek ke `C:\xampp\htdocs\imperium` (atau folder pilihan).
2. Jalankan Apache dan MySQL dari XAMPP Control Panel.
3. Buat database MySQL bernama `imperium` melalui phpMyAdmin, lalu import `database.sql`.
4. Periksa `api/config.local.php`. Nilai default memakai `localhost`, `imperium`,
   `root`, dan password kosong; sesuaikan jika MySQL lokal Anda memakai password.
5. Buka `http://localhost/imperium/` dan buat Admin pertama melalui
   `http://localhost/imperium/api/install-admin.php`. Kunci lokal default tercantum
   pada konfigurasi lokal dan hanya untuk pengembangan di komputer sendiri.

## Menjalankan di InfinityFree

1. Buat database MySQL di panel hosting dan import `database.sql` melalui phpMyAdmin.
2. Isi host, nama database, username, password, dan `ADMIN_SETUP_KEY` acak di
   `api/config.infinityfree.php`.
3. Upload aplikasi ke folder `htdocs` sesuai panduan deploy. Jangan unggah
   `config.local.php`, `config.example.php`, atau `database.sql`.
4. Jalankan wizard `api/install-admin.php`, lalu hapus file wizard jika masih ada.
5. Buka website memakai HTTPS dan uji Admin, Mode Dosen, upload, serta download.

`api/config.php` memilih konfigurasi lokal hanya untuk host `localhost`,
`127.0.0.1`, atau `::1`; host selain itu memakai konfigurasi InfinityFree. Kredensial dan
`ADMIN_SETUP_KEY` tidak boleh dimasukkan ke JavaScript atau dibagikan.

## Penyimpanan tugas

Isi file tugas disimpan di kolom `assignments.file_data` pada MySQL (base64 data
URL), bukan di direktori publik. Karena itu tidak perlu membuat folder upload
atau memberi permission filesystem; file unggahan juga tidak dapat dieksekusi
sebagai PHP. Setiap file dibatasi 5 MiB. Periksa bahwa batas PHP hosting
`upload_max_filesize` sekurang-kurangnya 5 MiB dan `post_max_size` cukup untuk
form multipart. Data file memakai ruang database lebih besar dari ukuran aslinya.

## Data awal

`database.sql` membuat tabel tanpa menghapus tabel/data lama dan menambahkan 10
mata kuliah starter yang sudah ada di frontend menggunakan `INSERT IGNORE`.
Semester 3–8 tersedia di antarmuka, tetapi tidak diisi dengan nama rekaan; Admin
dapat menambah seluruh mata kuliah melalui CRUD. SQL tidak membuat akun Admin
bawaan. Akun pertama dibuat melalui wizard agar tidak ada kredensial publik.

## Verifikasi dasar

- `GET api/auth.php?action=me` mengembalikan status session dalam JSON.
- `GET api/courses.php`, `GET api/assignment.php?list=1`, dan
  `GET api/meeting-meta.php?list=1` adalah baca publik untuk Mode Dosen.
- Mutasi mata kuliah/tugas/materi memerlukan session Admin dan CSRF.
- `GET api/download.php?courseId=c1&meetingNo=1` hanya melayani file terdaftar.
- Akses langsung ke file konfigurasi dan `database.sql` ditolak oleh `.htaccess`.

Lihat [PANDUAN-DEPLOY-INFINITYFREE.md](./PANDUAN-DEPLOY-INFINITYFREE.md) untuk
langkah deployment lengkap dan checklist pengujian.
