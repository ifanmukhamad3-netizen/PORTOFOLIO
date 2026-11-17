# Panduan XAMPP dan Deploy IMPERIUM ke InfinityFree

Panduan ini menggunakan database MySQL, bukan Live Server. Jalankan langkah
secara berurutan dan jangan publikasikan kredensial hosting.

## A. Uji lokal dengan XAMPP

1. Salin folder proyek ke `C:\xampp\htdocs\imperium`.
2. Dari XAMPP Control Panel, jalankan **Apache** dan **MySQL**.
3. Buka `http://localhost/phpmyadmin`, buat database `imperium`, pilih database
   tersebut, lalu import `database.sql`.
4. Buka `api/config.local.php`. Pengaturan awal:

   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'imperium');
   define('DB_USER', 'root');
   define('DB_PASS', '');
   ```

   Sesuaikan password bila MySQL lokal Anda tidak memakai password kosong.
5. Buka `http://localhost/imperium/`. Buat Admin pertama di
   `http://localhost/imperium/api/install-admin.php` memakai
   `ADMIN_SETUP_KEY` lokal yang ada di `config.local.php`.
6. Pilih **Akademik → Admin**, lalu login dengan username/password yang baru dibuat.
   Uji Mode Dosen di jendela privat untuk memastikan akses tidak memerlukan login.

## B. Persiapan database InfinityFree

1. Buat akun hosting dan domain di InfinityFree, lalu buka Control Panel.
2. Buka **MySQL Databases**, buat database, dan catat nilai host, database name,
   username, serta password yang ditampilkan panel.
3. Klik **Admin/phpMyAdmin** untuk database tersebut. Pilih database yang benar,
   buka tab **Import**, pilih `database.sql`, lalu jalankan import.
4. Pastikan tabel berikut ada: `admin_users`, `courses`, `assignments`,
   `meeting_meta`. Database baru juga berisi 10 mata kuliah starter; tidak ada
   akun Admin bawaan.
5. Import ulang aman untuk tabel/data yang sudah ada: tabel dibuat dengan
   `IF NOT EXISTS`, dan starter courses menggunakan `INSERT IGNORE`. SQL ini
   tidak menghapus maupun menimpa isi database yang sudah ada.

## C. Konfigurasi database hosting

Edit hanya `api/config.infinityfree.php` pada salinan yang akan diunggah:

```php
define('DB_DRIVER', 'mysql');
define('DB_HOST', 'HOST_MYSQL_DARI_PANEL');
define('DB_NAME', 'NAMA_DATABASE_DARI_PANEL');
define('DB_USER', 'USERNAME_DATABASE_DARI_PANEL');
define('DB_PASS', 'PASSWORD_DATABASE_DARI_PANEL');
define('ADMIN_SETUP_KEY', 'KUNCI_ACAK_PANJANG_DAN_UNIK');
```

- Gunakan nilai persis dari menu **MySQL Databases**, bukan host situs atau `localhost`.
- Buat `ADMIN_SETUP_KEY` acak dan unik. Jangan gunakan contoh placeholder.
- Jangan menaruh password database atau setup key di HTML/JavaScript, Git publik,
  tangkapan layar, atau pesan dukungan.
- `api/config.php` otomatis memilih file lokal hanya pada host localhost dan
  konfigurasi InfinityFree pada domain publik.

## D. Upload ke `htdocs`

Unggah isi folder proyek ke folder `htdocs` hosting sehingga susunannya langsung
seperti berikut (jangan membuat folder `portofolio-deploy` tambahan di dalamnya):

```text
htdocs/
  index.html
  style.css
  script.js
  cinema.js
  .htaccess
  api/
  vendor/
```

Unggah `api/config.php` dan `api/config.infinityfree.php` yang sudah diisi.
**Jangan unggah** `api/config.local.php`, `api/config.example.php`, atau
`database.sql`. README/panduan tidak diperlukan agar situs berjalan.

## E. Penyimpanan tugas dan permission

File tugas disimpan di MySQL (`assignments.file_data`) dan dikirim sebagai
multipart upload. Aplikasi tidak menulis file tugas ke disk, sehingga tidak ada
folder upload yang perlu dibuat atau diubah permission-nya. Ini menghindari
eksekusi PHP dari file unggahan dan download hanya mengambil data yang terdaftar
di database.

Batas aplikasi adalah 5 MiB per berkas. Pastikan nilai PHP hosting
`upload_max_filesize` minimal 5 MiB dan `post_max_size` cukup untuk multipart
(disarankan minimal 8 MiB). Akun shared hosting dapat memiliki batas database/
request tersendiri; bila hosting menolak berkas berukuran besar, gunakan berkas
lebih kecil dan periksa pesan/error log yang disediakan panel.

## F. Buat akun Admin

1. Setelah upload dan konfigurasi, buka
   `https://DOMAIN-ANDA/api/install-admin.php`.
2. Isi setup key yang sama dengan `ADMIN_SETUP_KEY`, username (4–40 karakter),
   dan password kuat (minimal 8 karakter).
3. Jika akun berhasil dibuat, wizard mencoba menghapus dirinya sendiri.
   Bila halaman meminta penghapusan manual, hapus `api/install-admin.php` dari
   `htdocs` melalui File Manager/FTP.
4. Jika wizard menyatakan akun Admin sudah ada, akun tidak ditimpa. Hapus wizard
   dari hosting dan gunakan akun yang sudah terdaftar.

Skema baru tidak membuat Admin default. Jika database berasal dari versi lama,
baris Admin yang sudah ada tidak dihapus oleh import non-destruktif ini; login
dengan akun yang Anda miliki lalu ganti password sebelum situs dipublikasikan.

## G. Aktifkan HTTPS

Aktifkan sertifikat SSL untuk domain melalui panel. Buka situs menggunakan
`https://`. Aturan paksa-HTTPS di `.htaccess` sengaja tidak aktif secara default;
setelah SSL dipastikan aktif, pemilik hosting dapat mengaktifkan blok opsional
di bagian akhir file tersebut.

## H. Checklist pengujian setelah deploy

### Halaman dan aset

- [ ] Buka halaman utama dan navigasi semua bagian (Beranda, Tentang, Akademik,
      Skills, Galeri, Kontak).
- [ ] Pastikan CSS, GSAP, ScrollTrigger, Lenis, gambar profil, dan animasi tampil.
- [ ] Buka Developer Tools → Network/Console; tidak ada 404/500 pada aset atau API.
- [ ] Font dan ikon mengambil aset dari CDN; tanpa koneksi CDN, isi tetap tersedia
      tetapi tampilan font/ikon dapat berbeda.

### Mode Dosen (tanpa login)

- [ ] Buka Akademik → **Mode Dosen** tanpa login.
- [ ] Pastikan 10 starter courses tampil, semester 1–8 dapat dipilih, dan
      pertemuan 1–16 ditampilkan.
- [ ] Dosen dapat melihat metadata dan mengunduh tugas yang tersedia.
- [ ] Tombol tambah/edit/hapus/upload tidak ditampilkan dalam Mode Dosen.
- [ ] Kirim `POST` tanpa session ke endpoint mutasi; server harus menolak dengan
      JSON HTTP 401. Kirim mutasi tanpa CSRF pada session Admin; server harus
      menolak dengan HTTP 403.

### Admin, session, dan CRUD

- [ ] Login dengan akun Admin yang dibuat oleh wizard.
- [ ] Muat ulang halaman; session Admin tetap terdeteksi.
- [ ] Login dengan password salah; pesan tidak membocorkan keberadaan username.
- [ ] Tambah/edit/hapus mata kuliah, termasuk semester 1 sampai 8; verifikasi tabel
      `courses` berubah.
- [ ] Simpan metadata pertemuan 1–16; verifikasi Mode Dosen melihat perubahan.
- [ ] Logout; Admin kembali ke gerbang. Request logout Admin tanpa token CSRF
      harus ditolak.

### Upload dan download

- [ ] Upload PDF/DOCX berukuran di bawah 5 MiB; cek metadata di tabel `assignments`.
- [ ] Upload ekstensi tidak diizinkan, berkas palsu (ekstensi tidak cocok MIME),
      dan berkas di atas 5 MiB; semuanya harus ditolak.
- [ ] Unduh tugas sebagai Dosen; respons berupa file attachment dengan tipe aman.
- [ ] Ubah parameter courseId/meetingNo atau coba file yang tidak terdaftar;
      endpoint tidak boleh mengirim file.
- [ ] Hapus tugas sebagai Admin; pastikan file hilang dari daftar dan unduhan.

### File yang dilindungi

- [ ] `https://DOMAIN-ANDA/api/config.php` dan
      `https://DOMAIN-ANDA/api/config.infinityfree.php` harus ditolak.
- [ ] `https://DOMAIN-ANDA/database.sql` harus ditolak (atau 404 jika tidak diunggah).
- [ ] Pastikan `api/install-admin.php` telah dihapus setelah setup.

Jika API gagal, lihat respons JSON dan log error hosting. Jangan mengaktifkan
`display_errors` di situs publik.

## Temuan audit dan perbaikannya

- Akun Admin seed memiliki kredensial publik dan membuat wizard tidak bisa
  digunakan pada instalasi baru: seed password dihapus; wizard sekarang membuat
  akun pertama.
- Satu file konfigurasi semula berisi placeholder hosting sekaligus menjadi
  konfigurasi lokal: konfigurasi XAMPP, InfinityFree, dan contoh dipisah serta
  dilindungi `.htaccess`.
- Cache lokal menyimpan base64 tugas dan dapat memenuhi kuota browser: upload kini
  multipart dan browser hanya menyimpan metadata setelah server berhasil.
- Operasi hapus lokal tetap berjalan saat request server gagal: UI sekarang
  mempertahankan salinan lokal dan menampilkan kegagalan tanpa mengklaim sukses.
- Fileinfo/mbstring bergantung pada konfigurasi PHP: MIME harus diverifikasi;
  teks memakai fallback UTF-8 jika mbstring tidak ada.
- Link proyek hanya menerima skema HTTP/HTTPS dan ID mata kuliah di-escape saat
  dirender untuk mengurangi risiko XSS dari data lama.
- Daftar mata kuliah belum ada di SQL dan starter hanya mencakup semester 1–2:
  sepuluh course yang ada ditambahkan secara non-destruktif; semester 3–8 tidak
  diisi dengan nama yang tidak diberikan.
