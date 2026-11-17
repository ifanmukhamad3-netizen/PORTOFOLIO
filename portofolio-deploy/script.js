/* ============================================================================
   IMPERIUM — THE DIGITAL EMPIRE · DATA & INTERACTION CONTROLLER
   ------------------------------------------------------------------
   Mempertahankan seluruh fungsi existing:
   · CRUD Mata Kuliah        → localStorage "user_courses" + database (api/courses.php)
   · CRUD Proyek             → localStorage "user_projects"
   · File tugas pertemuan    → MySQL via API PHP; browser menyimpan metadata.
                                File lokal lama tetap dapat dibaca/diunduh.
   · Metadata materi 1–16    → localStorage "course_meeting_<cid>_m_<n>"
                                + sinkronisasi MySQL via api/meeting-meta.php
   · Foto profil             → localStorage "profile_avatar"

   BARU (revisi sistem akademik):
   · Gerbang akses dua mode  → ADMIN (login username/password, session server,
                                token CSRF) dan MODE DOSEN (tanpa login,
                                hanya lihat & unduh dari server).
   · Keamanan dipegang backend: POST/PUT/DELETE ditolak tanpa session Admin
                                + token CSRF (lihat api/*.php).
   Tidak ada data dummy yang menggantikan data asli.
   ========================================================================== */
(function () {
  'use strict';

  const GDRIVE_FOLDER_ID = "1fxyThr62iXnmLISK9hstd4VCW3IYcbPr";
  const GDRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1fxyThr62iXnmLISK9hstd4VCW3IYcbPr";

  // URL API PHP same-origin.
  // Path relatif → berfungsi di domain utama maupun subfolder sekalipun.
  const API_ASSIGNMENT  = "api/assignment.php";
  const API_MEETING_META = "api/meeting-meta.php";
  const API_AUTH        = "api/auth.php";
  const API_COURSES     = "api/courses.php";
  const API_DOWNLOAD    = "api/download.php";

  // Validasi file tugas di sisi klien — server melakukan validasi yang sama
  // secara independen (jangan hanya mengandalkan salah satu sisi).
  const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'webp'];
  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

  const TOTAL_MEETINGS = 16;
  const COURSE_ICONS = [
    'fa-solid fa-scale-balanced', 'fa-solid fa-scroll', 'fa-solid fa-landmark',
    'fa-solid fa-book-open', 'fa-solid fa-building-columns', 'fa-solid fa-coins',
    'fa-solid fa-gavel', 'fa-solid fa-feather-pointed', 'fa-solid fa-mountain-sun'
  ];

  const defaultCourses = [
    { id: 'c1', name: 'Agama', semester: 1, classCode: 'TI24C' },
    { id: 'c2', name: 'Logika Matematika', semester: 1, classCode: 'TI24C' },
    { id: 'c3', name: 'Pancasila', semester: 1, classCode: 'TI24C' },
    { id: 'c4', name: 'Matematika', semester: 1, classCode: 'TI24C' },
    { id: 'c5', name: 'Pengantar Teknologi Informasi', semester: 1, classCode: 'TI24C' },
    { id: 'c6', name: 'Pengantar Teknologi Informasi II', semester: 1, classCode: 'TI24C' },
    { id: 'c7', name: 'Fisika', semester: 1, classCode: 'TI24C' },
    { id: 'c8', name: 'Dasar Algoritma dan Pemrograman', semester: 1, classCode: 'TI24C' },
    { id: 'c9', name: 'Bahasa Inggris (Reading for Concepts)', semester: 1, classCode: 'TI24C' },
    { id: 'c10', name: 'Kewarganegaraan', semester: 2, classCode: 'TI24C' }
  ];

  let activeSemester = 1;
  let courses = [];   // mode ADMIN: mirror localStorage + server
  let projects = [];

  /* ---------- Keadaan akses ---------- */
  let accessMode = null;      // null (gerbang) | 'admin' | 'dosen'
  let adminUsername = null;
  let csrfToken = null;

  /* Repository publik untuk Mode Dosen — hanya di memori (read-only). */
  let repo = { courses: [], files: {}, metas: {} };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const ROMAN = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
    [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  function toRoman(n) {
    n = Math.max(0, Math.round(n));
    if (n === 0) return '·';
    let out = '';
    for (const [v, s] of ROMAN) { while (n >= v) { out += s; n -= v; } }
    return out;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  window.showToast = showToast;

  /* ======================================================================
   *  LAPISAN API — semua mutasi membawa token CSRF (X-CSRF-Token).
   *  Server yang menegakkan otentikasi; frontend hanya membantu UX.
   * ====================================================================== */
  async function apiJson(url, opts = {}) {
    const headers = {};
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body && !isFormData) headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: opts.body ? (isFormData ? opts.body : JSON.stringify(opts.body)) : undefined
    });

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok || !data || data.status !== 'success') {
      throw new Error((data && data.message) ? data.message : ('Kesalahan server (HTTP ' + res.status + ')'));
    }
    return data;
  }

  function requireAdminMode() {
    if (accessMode !== 'admin') {
      showToast('Hanya Admin yang dapat mengubah data repository.');
      return false;
    }
    return true;
  }

  /* ======================================================================
   *  GERBANG AKSES & MANAJER MODE (ADMIN / MODE DOSEN)
   * ====================================================================== */
  const MODE_KEY = 'imperium_access_mode';

  function sectionEl() { return $('#academic'); }

  function applyMode(mode) {
    accessMode = mode;
    try { sessionStorage.setItem(MODE_KEY, mode || ''); } catch (e) { /* abaikan */ }

    const section = sectionEl();
    if (section) {
      section.classList.remove('mode-gate', 'mode-admin', 'mode-dosen');
      section.classList.add(mode === 'admin' ? 'mode-admin' : (mode === 'dosen' ? 'mode-dosen' : 'mode-gate'));
    }

    /* Badge & tombol mode */
    $('#mode-badge-admin').classList.toggle('hidden', mode !== 'admin');
    $('#mode-badge-dosen').classList.toggle('hidden', mode !== 'dosen');
    $('#mode-admin-name').textContent = mode === 'admin' ? (adminUsername || 'admin') : '';
    $('#logout-btn').classList.toggle('hidden', mode !== 'admin');
    $('#change-pass-btn').classList.toggle('hidden', mode !== 'admin');
    $('#change-mode-btn').classList.toggle('hidden', mode === null);

    /* Panel login & ganti password selalu tertutup saat mode berubah */
    $('#admin-login-panel').classList.add('hidden');
    $('#admin-password-panel').classList.add('hidden');
    $('#access-gate').classList.remove('hidden');

    if (mode === 'admin') {
      ensureCoursesLoaded();
    } else if (mode === 'dosen') {
      loadRepoPublic();
    } else {
      renderSemesterTabs();
      renderCourseList();
    }
    if (window.IMPERIUM) window.IMPERIUM.refresh();
  }

  /* Saat halaman dibuka: cek session Admin di server, lalu mode terakhir di tab ini. */
  async function restoreAccess() {
    try {
      const res = await apiJson(API_AUTH + '?action=me');
      if (res && res.data && res.data.authenticated) {
        csrfToken = res.data.csrfToken;
        adminUsername = res.data.username;
        applyMode('admin');
        return;
      }
    } catch (e) { /* server tidak terjangkau → lanjut ke gerbang */ }
    let remembered = '';
    try { remembered = sessionStorage.getItem(MODE_KEY) || ''; } catch (e) {}
    applyMode(remembered === 'dosen' ? 'dosen' : (remembered === 'admin' ? null : null));
  }

  function initGate() {
    $('#gate-admin-btn')?.addEventListener('click', () => {
      $('#access-gate').classList.add('hidden');
      $('#admin-login-panel').classList.remove('hidden');
      $('#admin-login-error').classList.add('hidden');
      $('#admin-username').focus();
    });

    $('#gate-dosen-btn')?.addEventListener('click', () => {
      applyMode('dosen');
      showToast('Mode Dosen aktif — Anda dapat melihat & mengunduh seluruh arsip.');
    });

    $('#admin-login-back')?.addEventListener('click', hideLoginPanel);
    $('#admin-login-cancel')?.addEventListener('click', hideLoginPanel);

    $('#admin-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#admin-login-submit');
      const errBox = $('#admin-login-error');
      errBox.classList.add('hidden');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Memeriksa…';
      try {
        const res = await apiJson(API_AUTH + '?action=login', {
          method: 'POST',
          body: {
            username: $('#admin-username').value.trim(),
            password: $('#admin-password').value
          }
        });
        csrfToken = res.data.csrfToken;
        adminUsername = res.data.username;
        $('#admin-password').value = '';
        applyMode('admin');
        showToast('Login berhasil. Selamat datang, ' + adminUsername + '.');
      } catch (err) {
        errBox.textContent = err.message || 'Login gagal.';
        errBox.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Masuk';
      }
    });

    $('#logout-btn')?.addEventListener('click', async () => {
      try { await apiJson(API_AUTH + '?action=logout', { method: 'POST' }); } catch (e) { /* abaikan */ }
      csrfToken = null;
      adminUsername = null;
      applyMode(null);
      showToast('Logout berhasil — Anda keluar dari mode Admin.');
    });

    $('#change-mode-btn')?.addEventListener('click', () => {
      if (accessMode === 'admin') {
        /* Keluar mode admin (tanpa menghapus session server? — logout bersih) */
        apiJson(API_AUTH + '?action=logout', { method: 'POST' }).catch(() => {});
        csrfToken = null;
        adminUsername = null;
      }
      applyMode(null);
    });

    /* ---------- Ganti password admin ---------- */
    $('#change-pass-btn')?.addEventListener('click', () => {
      $('#admin-password-panel').classList.remove('hidden');
      $('#admin-password-msg').classList.add('hidden');
      $('#admin-pass-old').focus();
    });
    $('#admin-password-close')?.addEventListener('click', () => $('#admin-password-panel').classList.add('hidden'));
    $('#admin-password-cancel')?.addEventListener('click', () => $('#admin-password-panel').classList.add('hidden'));

    $('#admin-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#admin-password-msg');
      msg.classList.add('hidden');
      const oldP = $('#admin-pass-old').value;
      const newP = $('#admin-pass-new').value;
      const conf = $('#admin-pass-confirm').value;
      if (newP !== conf) {
        msg.textContent = 'Konfirmasi password baru tidak sama.';
        msg.classList.remove('hidden');
        return;
      }
      try {
        const res = await apiJson(API_AUTH + '?action=change-password', {
          method: 'POST',
          body: { currentPassword: oldP, newPassword: newP }
        });
        csrfToken = res.data.csrfToken; // token baru diterbitkan setelah session di-regenerate
        $('#admin-password-form').reset();
        msg.textContent = 'Password berhasil diganti.';
        msg.style.borderColor = 'rgba(124,148,115,.55)';
        msg.style.background = 'rgba(124,148,115,.12)';
        msg.style.color = '#cfe3c3';
        msg.classList.remove('hidden');
        showToast('Password admin berhasil diganti.');
      } catch (err) {
        msg.textContent = err.message || 'Gagal mengganti password.';
        msg.classList.remove('hidden');
      }
    });
  }

  function hideLoginPanel() {
    $('#admin-login-panel').classList.add('hidden');
    $('#access-gate').classList.remove('hidden');
  }

  /* ======================================================================
   *  LAPISAN DATA — mode Admin (localStorage + server) vs Mode Dosen (server)
   * ====================================================================== */
  function activeCourses() {
    return accessMode === 'dosen' ? repo.courses : courses;
  }
  function repoKey(cid, m) { return cid + '_m_' + m; }

  function dataGetMeta(cid, m) {
    if (accessMode === 'dosen') return repo.metas[repoKey(cid, m)] || {};
    return getMeetingMeta(cid, m);
  }
  function dataGetFile(cid, m) {
    if (accessMode === 'dosen') return repo.files[repoKey(cid, m)] || null;
    return meetingFile(cid, m);
  }
  function dataHasFile(cid, m) {
    if (accessMode === 'dosen') return Boolean(repo.files[repoKey(cid, m)]);
    return Boolean(localStorage.getItem('course_assignment_' + cid + '_m_' + m));
  }

  /* ---------- MODE ADMIN: pembaca localStorage (mirror server, perilaku lama) ---------- */
  function meetingFile(courseId, m) {
    const raw = localStorage.getItem('course_assignment_' + courseId + '_m_' + m);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function getMeetingMeta(courseId, m) {
    try { return JSON.parse(localStorage.getItem('course_meeting_' + courseId + '_m_' + m)) || {}; }
    catch (e) { return {}; }
  }

  function isMeetingDone(courseId, m) {
    const meta = dataGetMeta(courseId, m);
    if (meta.done) return true;
    return dataHasFile(courseId, m);
  }
  function courseProgress(course) {
    let done = 0;
    for (let m = 1; m <= TOTAL_MEETINGS; m++) {
      if (isMeetingDone(course.id, m)) done++;
    }
    return done;
  }

  /* ---------- MODE DOSEN: muat repository publik dari server (read-only) ---------- */
  async function loadRepoPublic() {
    try {
      const [c, a, m] = await Promise.all([
        apiJson(API_COURSES),
        apiJson(API_ASSIGNMENT + '?list=1'),
        apiJson(API_MEETING_META + '?list=1')
      ]);
      repo.courses = (c.data || []).map((x) => ({
        id: x.id, name: x.name, semester: Number(x.semester) || 1,
        classCode: x.classCode || 'TI24C', description: x.description || ''
      }));
      repo.files = {};
      (a.data || []).forEach((r) => {
        repo.files[repoKey(r.courseId, r.meetingNo)] = { name: r.fileName, size: r.fileSize, remote: true };
      });
      repo.metas = {};
      (m.data || []).forEach((r) => {
        repo.metas[repoKey(r.courseId, r.meetingNo)] = {
          title: r.title || '', desc: r.desc || '', notes: r.notes || '', done: Boolean(r.done), remote: true
        };
      });
      renderSemesterTabs();
      renderCourseList();
      if (!repo.courses.length) showToast('Repository masih kosong — Admin belum menambahkan mata kuliah.');
      else showToast('Repository dimuat: ' + repo.courses.length + ' mata kuliah (hanya lihat).');
    } catch (e) {
      repo.courses = [];
      repo.files = {};
      repo.metas = {};
      renderSemesterTabs();
      renderCourseList();
      showToast('Server tidak terjangkau — repository tidak dapat dimuat. Tekan Ganti Mode untuk mencoba lagi.');
    }
    if (window.IMPERIUM) window.IMPERIUM.refresh();
  }

  /* ---------- MODE ADMIN: muat mata kuliah + sinkronisasi server ---------- */
  function loadLocalCourses() {
    const saved = localStorage.getItem('user_courses');
    if (saved) {
      try {
        courses = JSON.parse(saved).map((c) => ({
          ...c,
          description: c.description || '',
          classCode: c.classCode || 'TI24C',
          semester: Number(c.semester) || 1
        }));
      } catch (e) { courses = []; }
    } else {
      courses = [];
    }
  }

  async function ensureCoursesLoaded() {
    loadLocalCourses();

    /* Server tidak terjangkau → perilaku lama: data lokal tetap dipakai. */
    let serverList = null;
    try {
      const res = await apiJson(API_COURSES);
      serverList = Array.isArray(res.data) ? res.data : [];
    } catch (e) {
      if (!courses.length) {
        courses = defaultCourses.map((c) => ({ ...c, description: '' }));
        localStorage.setItem('user_courses', JSON.stringify(courses));
      }
      renderSemesterTabs();
      renderCourseList();
      syncFromServer();
      showToast('Server tidak terjangkau — memakai data lokal sementara.');
      return;
    }

    if (serverList.length === 0) {
      /* Server kosong → migrasikan isi browser ini (atau mata kuliah default)
         sekali saja agar Mode Dosen di semua perangkat melihat data yang sama. */
      if (!courses.length) {
        courses = defaultCourses.map((c) => ({ ...c, description: '' }));
        localStorage.setItem('user_courses', JSON.stringify(courses));
      }
      if (courses.length && confirm('Migrasikan ' + courses.length + ' mata kuliah dari browser ini ke database?\n\nSupaya Mode Dosen dan perangkat lain melihat arsip yang sama. Data lama tidak dihapus.')) {
        for (const c of courses) {
          try { await apiJson(API_COURSES, { method: 'POST', body: c }); } catch (e) { /* lanjutkan yang lain */ }
        }
        showToast('Mata kuliah berhasil dimigrasikan ke database.');
      }
      renderSemesterTabs();
      renderCourseList();
      syncFromServer();
      return;
    }

    /* Server punya data → server menjadi sumber utama; mata kuliah yang hanya
       ada di browser ini (dibuat saat offline) diunggah ke server, tidak dihapus. */
    const serverIds = new Set(serverList.map((c) => c.id));
    const localOnly = courses.filter((c) => !serverIds.has(c.id));
    courses = serverList.map((c) => ({
      id: c.id, name: c.name, semester: Number(c.semester) || 1,
      classCode: c.classCode || 'TI24C', description: c.description || ''
    })).concat(localOnly);
    localStorage.setItem('user_courses', JSON.stringify(courses));
    for (const c of localOnly) {
      try { await apiJson(API_COURSES, { method: 'POST', body: c }); } catch (e) { /* offline — coba lagi nanti */ }
    }
    renderSemesterTabs();
    renderCourseList();
    syncFromServer();
  }

  /* ======================================================================
   *  ACADEMIC REPOSITORY — RENDER (dipakai kedua mode)
   * ====================================================================== */
  function renderSemesterTabs() {
    const tabs = $('#semester-tabs');
    if (!tabs) return;
    const list = activeCourses();
    let html = '';
    for (let sem = 1; sem <= 8; sem++) {
      const count = list.filter((c) => c.semester === sem).length;
      html += `<button class="tab-btn ${sem === activeSemester ? 'active' : ''}" role="tab"
        aria-selected="${sem === activeSemester}" data-sem="${sem}">
        Semester ${toRoman(sem)} <span>(${count})</span></button>`;
    }
    tabs.innerHTML = html;
    tabs.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => changeSemester(parseInt(btn.dataset.sem, 10)));
    });
  }

  function changeSemester(sem) {
    activeSemester = sem;
    renderSemesterTabs();
    renderCourseList();
  }

  function renderCourseList() {
    const list = $('#course-list');
    if (!list) return;
    const allCourses = activeCourses();
    const isAdmin = accessMode === 'admin';
    const semCourses = allCourses.filter((c) => c.semester === activeSemester);

    if (!semCourses.length) {
      const emptyMsg = accessMode === 'dosen'
        ? 'Belum ada mata kuliah yang diarsipkan Admin di semester ini.'
        : `Tekan tombol "Tambah Mata Kuliah" untuk mulai mengarsipkan perjalanan akademik Anda.`;
      list.innerHTML = `
        <div class="empty-state-card" style="grid-column:1/-1;">
          <i class="fa-solid fa-scroll empty-state-icon"></i>
          <h3>Belum ada mata kuliah di Semester ${toRoman(activeSemester)}</h3>
          <p>${emptyMsg}</p>
        </div>`;
    } else {
      list.innerHTML = semCourses.map((c, index) => {
        const done = courseProgress(c);
        const pct = Math.round((done / TOTAL_MEETINGS) * 100);
        const icon = COURSE_ICONS[index % COURSE_ICONS.length];
        const desc = c.description
          ? escapeHtml(c.description)
          : 'Deskripsi belum ditambahkan — sunting mata kuliah ini untuk melengkapi arsip.';

        let pills = '';
        for (let m = 1; m <= TOTAL_MEETINGS; m++) {
          const meta = dataGetMeta(c.id, m);
          const hasFile = dataHasFile(c.id, m);
          const cls = meta.done ? 'done' : (hasFile ? 'file' : '');
          const tip = meta.title ? ` — ${escapeHtml(meta.title)}` : (hasFile ? ' — ada file tugas' : '');
          pills += `<button class="mpill ${cls}" data-m="${m}" type="button"
            title="Pertemuan ${m}${tip}" aria-label="Detail pertemuan ${m}">${m}</button>`;
        }

        // Tombol edit/hapus hanya dirender untuk Admin (Mode Dosen tidak punya).
        const adminEdit = isAdmin ? `
                <button class="icon-btn" data-action="edit" type="button" title="Edit Mata Kuliah" aria-label="Edit mata kuliah"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn" data-action="delete" type="button" title="Hapus Mata Kuliah" aria-label="Hapus mata kuliah"><i class="fa-solid fa-trash"></i></button>` : '';

        return `
        <article class="course-card" data-id="${escapeHtml(c.id)}" tabindex="0" role="button"
          aria-label="Mata kuliah ${escapeHtml(c.name)} — tekan untuk membalik kartu">
          <div class="course-card-inner">

            <div class="course-face course-front">
              <div class="course-frame" aria-hidden="true"></div>
              <div class="course-front-actions">${adminEdit}</div>
              <svg class="course-front-ornament" aria-hidden="true"><use href="#sym-laurel"/></svg>
              <i class="course-fa-icon ${icon}" aria-hidden="true"></i>
              <h3 class="course-name">${escapeHtml(c.name)}</h3>
              <div class="course-front-meta">
                <span class="meta-chip">Semester ${toRoman(c.semester)}</span>
                <span class="meta-chip bronze">${escapeHtml(c.classCode || 'TI24C')}</span>
              </div>
              <span class="course-index" aria-hidden="true">${toRoman(index + 1)}</span>
              <div class="course-flip-hint"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Klik untuk membuka arsip</div>
            </div>

            <div class="course-face course-back">
              <span class="course-back-hint">Klik untuk kembali</span>
              <div class="course-back-head">
                <h3 class="course-back-name">${escapeHtml(c.name)}</h3>
                <span class="course-back-sem">SEM ${toRoman(c.semester)}</span>
              </div>
              <p class="course-back-desc">${desc}</p>
              <div class="course-progress">
                <div class="cp-label"><span>Progress Pembelajaran</span><b>${done} / ${TOTAL_MEETINGS}</b></div>
                <div class="cp-bar"><div class="cp-fill" style="width:${pct}%"></div></div>
              </div>
              <div class="meetings-mini" aria-label="Status pertemuan 1 sampai 16">${pills}</div>
              <div class="course-back-actions">
                <button class="btn btn-primary btn-small" data-action="detail" type="button">
                  <i class="fa-solid fa-folder-open"></i> Lihat Detail
                </button>
                ${isAdmin ? `
                <button class="icon-btn" data-action="edit" type="button" title="Edit" aria-label="Edit mata kuliah"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn" data-action="delete" type="button" title="Hapus" aria-label="Hapus mata kuliah"><i class="fa-solid fa-trash"></i></button>` : ''}
              </div>
            </div>

          </div>
        </article>`;
      }).join('');
    }

    renderAcademicSummary();
    if (window.IMPERIUM) {
      window.IMPERIUM.animateCards(list);
      window.IMPERIUM.refresh();
    }
  }

  function renderAcademicSummary() {
    const box = $('#academic-summary');
    if (!box) return;
    const list = activeCourses();
    const totalSelesai = list.reduce((acc, c) => acc + courseProgress(c), 0);
    const totalSlot = list.length * TOTAL_MEETINGS;
    const pct = totalSlot ? Math.round((totalSelesai / totalSlot) * 100) : 0;
    box.innerHTML = `
      <span class="sum-chip"><i class="fa-solid fa-landmark"></i> Mata Kuliah <b>${list.length}</b></span>
      <span class="sum-chip"><i class="fa-solid fa-check-double"></i> Pertemuan Selesai <b>${totalSelesai}</b></span>
      <span class="sum-chip"><i class="fa-solid fa-chart-line"></i> Progress <b>${pct}%</b></span>`;
  }

  /* ---------- Interaksi kartu: FLIP 3D + tombol aksi + pil pertemuan ---------- */
  function initCourseListEvents() {
    const list = $('#course-list');
    if (!list) return;

    list.addEventListener('click', (e) => {
      const card = e.target.closest('.course-card');
      if (!card) return;
      const id = card.dataset.id;

      // Pil pertemuan → buka modal detail pertemuan
      const pill = e.target.closest('.mpill');
      if (pill) {
        e.stopPropagation();
        openMeetingModal(id, parseInt(pill.dataset.m, 10));
        return;
      }

      // Tombol aksi (depan & belakang) — hanya ada pada mode Admin
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const act = actionBtn.dataset.action;
        if (act === 'edit') editCourse(id);
        else if (act === 'delete') deleteCourse(id);
        else if (act === 'detail') openMeetingModal(id, firstOpenMeeting(id));
        return;
      }

      // Flip hanya kartu ini — kartu lain tidak terpengaruh
      card.classList.toggle('flipped');
    });

    // Aksesibilitas: Enter / Space membalik kartu
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.course-card');
      if (!card || e.target !== card) return;
      e.preventDefault();
      card.classList.toggle('flipped');
    });
  }

  function firstOpenMeeting(courseId) {
    for (let m = 1; m <= TOTAL_MEETINGS; m++) if (!isMeetingDone(courseId, m)) return m;
    return 1;
  }

  /* ---------- Form mata kuliah (CREATE & UPDATE — Admin) ---------- */
  function initForms() {
    const semSelect = $('#course-semester');
    if (semSelect) {
      let opt = '';
      for (let i = 1; i <= 8; i++) opt += `<option value="${i}">Semester ${toRoman(i)}</option>`;
      semSelect.innerHTML = opt;
    }

    $('#add-course-btn')?.addEventListener('click', () => openCourseForm());
    $('#cancel-course-btn')?.addEventListener('click', closeCourseForm);
    $('#cancel-course-btn-2')?.addEventListener('click', closeCourseForm);
    $('#course-form')?.addEventListener('submit', handleCourseSubmit);

    $('#add-project-btn')?.addEventListener('click', () => openProjectForm());
    $('#cancel-project-btn')?.addEventListener('click', closeProjectForm);
    $('#cancel-project-btn-2')?.addEventListener('click', closeProjectForm);
    $('#project-form')?.addEventListener('submit', handleProjectSubmit);
  }

  function openCourseForm(courseId = null) {
    if (!requireAdminMode()) return;
    const wrap = $('#course-form-wrap');
    const title = $('#course-form-title');
    if (!wrap) return;

    if (courseId) {
      const c = activeCourses().find((item) => item.id === courseId);
      if (!c) return;
      title.textContent = 'Edit Mata Kuliah';
      $('#course-id').value = c.id;
      $('#course-name').value = c.name;
      $('#course-desc').value = c.description || '';
      $('#course-semester').value = c.semester;
      $('#course-class').value = c.classCode || 'TI24C';
    } else {
      title.textContent = 'Tambah Mata Kuliah';
      $('#course-form').reset();
      $('#course-id').value = '';
      $('#course-semester').value = activeSemester;
      $('#course-class').value = 'TI24C';
    }

    wrap.classList.remove('hidden');
    wrap.scrollIntoView({ behavior: window.IMPERIUM && !window.IMPERIUM.reduced ? 'smooth' : 'auto', block: 'center' });
  }
  function closeCourseForm() { $('#course-form-wrap')?.classList.add('hidden'); }

  async function handleCourseSubmit(e) {
    e.preventDefault();
    if (!requireAdminMode()) return;

    const id = $('#course-id').value;
    const name = $('#course-name').value.trim();
    const description = $('#course-desc').value.trim();
    const semester = parseInt($('#course-semester').value, 10);
    const classCode = $('#course-class').value.trim() || 'TI24C';
    if (!name) return;

    const current = id ? courses.find((c) => c.id === id) : null;
    if (id && !current) {
      showToast('Mata kuliah tidak ditemukan pada data lokal. Muat ulang repository.');
      return;
    }
    const course = id
      ? { ...current, name, description, semester, classCode }
      : { id: 'c_' + Date.now(), name, description, semester, classCode };

    try {
      await apiJson(API_COURSES, { method: id ? 'PUT' : 'POST', body: course });
    } catch (err) {
      showToast('Mata kuliah belum tersimpan: ' + (err.message || 'database tidak dapat dihubungi.'));
      return;
    }

    if (id) {
      const index = courses.findIndex((c) => c.id === id);
      courses[index] = course;
    } else {
      courses.push(course);
    }
    showToast(id ? 'Mata kuliah diperbarui!' : 'Mata kuliah ditambahkan!');
    localStorage.setItem('user_courses', JSON.stringify(courses));
    activeSemester = semester;
    renderSemesterTabs();
    renderCourseList();
    closeCourseForm();
  }

  function editCourse(id) { openCourseForm(id); }

  async function deleteCourse(id) {
    if (!requireAdminMode()) return;
    const c = activeCourses().find((x) => x.id === id);
    if (!c) return;
    if (!confirm('Hapus mata kuliah ini beserta seluruh arsip pertemuannya (tugas & materi) di database?')) return;

    /* Server menghapus courses + assignments + meeting_meta dalam satu transaksi. */
    try {
      await apiJson(API_COURSES + '?id=' + encodeURIComponent(id), { method: 'DELETE' });
    } catch (err) {
      showToast('Mata kuliah belum dihapus: ' + (err.message || 'database tidak dapat dihubungi.'));
      return;
    }

    courses = courses.filter((x) => x.id !== id);
    // Bersihkan seluruh key file & metadata pertemuan milik mata kuliah ini
    for (let m = 1; m <= TOTAL_MEETINGS; m++) {
      localStorage.removeItem('course_assignment_' + id + '_m_' + m);
      localStorage.removeItem('course_meeting_' + id + '_m_' + m);
    }
    localStorage.removeItem('course_assignment_' + id); // key lama (kompatibilitas)
    localStorage.setItem('user_courses', JSON.stringify(courses));
    renderSemesterTabs();
    renderCourseList();
    if (!window.__courseWarned) {
      showToast('Mata kuliah dihapus.');
      window.__courseWarned = true;
      setTimeout(() => { window.__courseWarned = false; }, 1000);
    }
  }

  /* ======================================================================
   *  MODAL PERTEMUAN — Materi (judul/deskripsi/catatan/status) + File
   *  Mode Admin : dapat mengubah & mengunggah (session + CSRF di backend)
   *  Mode Dosen : hanya melihat & mengunduh (input dikunci + tombol disembunyikan)
   * ====================================================================== */
  let currentMeeting = { courseId: null, courseName: '', meetingNo: 1 };

  function initMeetingModal() {
    $('#mm-close')?.addEventListener('click', closeMeetingModal);
    $('#mm-prev')?.addEventListener('click', () => stepMeeting(-1));
    $('#mm-next')?.addEventListener('click', () => stepMeeting(1));
    $('#mm-save-meta')?.addEventListener('click', saveMeetingMeta);
    $('#mm-save-file')?.addEventListener('click', saveMeetingAssignment);
    $('#mm-download-btn')?.addEventListener('click', downloadMeetingAssignment);
    $('#mm-delete-btn')?.addEventListener('click', deleteMeetingAssignment);
    $('#mm-file-input')?.addEventListener('change', onModalFileSelected);

    const backdrop = $('#meeting-modal');
    backdrop?.addEventListener('click', (e) => { if (e.target === backdrop) closeMeetingModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !backdrop?.classList.contains('hidden')) closeMeetingModal();
    });
  }

  function stepMeeting(dir) {
    const next = ((currentMeeting.meetingNo - 1 + dir + TOTAL_MEETINGS) % TOTAL_MEETINGS) + 1;
    openMeetingModal(currentMeeting.courseId, next);
  }

  function openMeetingModal(courseId, meetingNo) {
    const course = activeCourses().find((c) => c.id === courseId);
    if (!course) return;
    currentMeeting = { courseId, courseName: course.name, meetingNo };

    $('#mm-title').textContent = `Pertemuan ${toRoman(meetingNo)} · ${course.name}`;
    $('#mm-subtitle').textContent =
      `Semester ${toRoman(course.semester)} — ${course.classCode || 'TI24C'} — Arsip pertemuan ${meetingNo} dari ${TOTAL_MEETINGS}`;

    const meta = dataGetMeta(courseId, meetingNo);
    $('#mm-title-input').value = meta.title || '';
    $('#mm-desc-input').value = meta.desc || '';
    $('#mm-notes-input').value = meta.notes || '';
    $('#mm-done-toggle').checked = Boolean(meta.done);

    const modal = $('#meeting-modal');
    const readonly = accessMode !== 'admin';
    modal.classList.toggle('readonly', readonly);
    ['#mm-title-input', '#mm-desc-input', '#mm-notes-input'].forEach((sel) => {
      const el = $(sel);
      if (el) el.disabled = readonly;
    });
    const toggle = $('#mm-done-toggle');
    if (toggle) toggle.disabled = readonly;
    $('#mm-readonly-note')?.classList.toggle('hidden', !readonly);

    refreshFileBox();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    window.IMPERIUM?.lenis()?.stop?.();
  }

  function refreshFileBox() {
    const { courseId, meetingNo } = currentMeeting;
    const saved = dataGetFile(courseId, meetingNo);
    const label = $('#mm-file-label');
    const statusEl = $('#mm-status');
    const dl = $('#mm-download-btn');
    const del = $('#mm-delete-btn');

    if (saved) {
      if (label) label.innerHTML = `<i class="fa-solid fa-file-check"></i> ${escapeHtml(saved.name)}`;
      if (statusEl) {
        if (saved.content) {
          statusEl.textContent = `Tersimpan lokal${saved.synced === false ? ' (menunggu sinkronisasi MySQL)' : ' & MySQL'}: ${saved.size}`;
        } else {
          statusEl.textContent = `Tersimpan di database: ${saved.size} — tekan Unduh untuk mengambil file.`;
        }
        statusEl.className = 'item-status success';
      }
      dl?.classList.remove('hidden');
      del?.classList.remove('hidden');
    } else {
      if (label) label.innerHTML = `<i class="fa-solid fa-paperclip"></i> Pilih File Tugas Pertemuan`;
      if (statusEl) { statusEl.textContent = 'Belum ada file tugas untuk pertemuan ini.'; statusEl.className = 'item-status'; }
      dl?.classList.add('hidden');
      del?.classList.add('hidden');
    }
    const input = $('#mm-file-input');
    if (input) input.value = '';
  }

  function closeMeetingModal() {
    $('#meeting-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
    window.IMPERIUM?.lenis()?.start?.();
    renderCourseList(); // segarkan status pil & progress
  }

  function onModalFileSelected() {
    const input = $('#mm-file-input');
    const label = $('#mm-file-label');
    if (!input?.files[0] || !label) return;
    const file = input.files[0];
    const check = validatePickedFile(file);
    if (!check.ok) {
      label.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(file.name)} — ditolak`;
      const statusEl = $('#mm-status');
      if (statusEl) { statusEl.textContent = check.message; statusEl.className = 'item-status error'; }
      input.value = '';
      return;
    }
    label.innerHTML = `<i class="fa-solid fa-file-code"></i> ${escapeHtml(file.name)}`;
  }

  /* Validasi file di sisi klien (server memvalidasi ulang secara independen). */
  function validatePickedFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      return { ok: false, message: 'Tipe file tidak diizinkan (ekstensi .' + (ext || '?') + '). Gunakan: ' + ALLOWED_EXT.join(', ') + '.' };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { ok: false, message: 'Ukuran file ' + formatBytes(file.size) + ' melebihi batas maksimal 5 MB.' };
    }
    return { ok: true, message: '' };
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  async function saveMeetingMeta() {
    if (!requireAdminMode()) return;
    const { courseId, meetingNo } = currentMeeting;
    const meta = {
      title: $('#mm-title-input').value.trim(),
      desc: $('#mm-desc-input').value.trim(),
      notes: $('#mm-notes-input').value.trim(),
      done: $('#mm-done-toggle').checked
    };
    try {
      const cached = await setMeetingMeta(courseId, meetingNo, meta);
      showToast(cached
        ? `Materi Pertemuan ${meetingNo} disimpan!`
        : 'Materi tersimpan di server, tetapi cache browser tidak dapat diperbarui.');
      renderCourseList();
    } catch (err) {
      showToast('Materi belum tersimpan: ' + (err.message || 'database tidak dapat dihubungi.'));
    }
  }

  async function setMeetingMeta(courseId, m, meta) {
    await apiJson(API_MEETING_META, {
      method: 'POST',
      body: {
        courseId: courseId,
        meetingNo: m,
        title: meta.title || '',
        desc: meta.desc || '',
        notes: meta.notes || '',
        done: Boolean(meta.done)
      }
    });
    const record = Object.assign({}, meta, { updatedAt: new Date().toISOString() });
    try {
      localStorage.setItem('course_meeting_' + courseId + '_m_' + m, JSON.stringify(record));
      return true;
    } catch (storageError) {
      return false;
    }
  }

  /* ---------- CRUD file: server-first; browser only caches file metadata ---------- */
  async function saveMeetingAssignment() {
    if (!requireAdminMode()) return;

    const input = $('#mm-file-input');
    const statusEl = $('#mm-status');
    const { courseId, meetingNo } = currentMeeting;

    if (!input || !input.files[0]) {
      if (statusEl) { statusEl.textContent = 'Pilih file terlebih dahulu!'; statusEl.className = 'item-status error'; }
      return;
    }

    const file = input.files[0];
    const check = validatePickedFile(file);
    if (!check.ok) {
      if (statusEl) { statusEl.textContent = check.message; statusEl.className = 'item-status error'; }
      input.value = '';
      onModalFileSelected();
      return;
    }

    const meetingKey = courseId + '_m_' + meetingNo;
    if (statusEl) { statusEl.textContent = `Menyiapkan ${file.name}...`; statusEl.className = 'item-status'; }

    const payload = new FormData();
    payload.append('courseId', courseId);
    payload.append('meetingNo', String(meetingNo));
    payload.append('file', file, file.name);

    const saveButton = $('#mm-save-file');
    if (saveButton) saveButton.disabled = true;
    try {
      const result = await apiJson(API_ASSIGNMENT, { method: 'POST', body: payload });
      const fileObj = {
        name: file.name,
        size: result && result.data && result.data.fileSize ? result.data.fileSize : formatBytes(file.size),
        content: null,
        gdriveUrl: GDRIVE_FOLDER_URL,
        synced: true,
        remote: true
      };
      let metadataCached = true;
      try {
        localStorage.setItem('course_assignment_' + meetingKey, JSON.stringify(fileObj));
      } catch (storageError) {
        metadataCached = false;
      }
      if (statusEl) { statusEl.textContent = 'Tugas tersimpan di repository.'; statusEl.className = 'item-status success'; }
      showToast(metadataCached
        ? `Tugas P${meetingNo} tersimpan di repository.`
        : `Tugas P${meetingNo} tersimpan di server, tetapi cache browser tidak dapat diperbarui.`);
      refreshFileBox();
    } catch (err) {
      const message = 'Tugas belum tersimpan di server: ' + (err.message || 'database tidak dapat dihubungi.');
      if (statusEl) { statusEl.textContent = message; statusEl.className = 'item-status error'; }
      showToast(message);
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  /* ---------- DELETE dari MySQL & lokal (Admin) ---------- */
  async function deleteMeetingAssignment() {
    if (!requireAdminMode()) return;
    const { courseId, meetingNo } = currentMeeting;
    const meetingKey = courseId + '_m_' + meetingNo;

    if (!confirm(`Hapus tugas Pertemuan ${meetingNo} dari MySQL dan penyimpanan lokal?`)) return;

    try {
      await apiJson(API_ASSIGNMENT + '?courseId=' + encodeURIComponent(courseId) + '&meetingNo=' + meetingNo, { method: 'DELETE' });
    } catch (err) {
      showToast('Tugas belum dihapus: ' + (err.message || 'database tidak dapat dihubungi.'));
      return;
    }

    localStorage.removeItem('course_assignment_' + meetingKey);
    showToast(`Tugas Pertemuan ${meetingNo} dihapus!`);
    refreshFileBox();
  }

  /* ---------- READ (unduh file) — tersedia untuk Admin & Mode Dosen ---------- */
  async function downloadMeetingAssignment() {
    const { courseId, meetingNo } = currentMeeting;
    const saved = dataGetFile(courseId, meetingNo);
    if (!saved) return;

    // File tersimpan lengkap di browser ini → unduh langsung (perilaku lama)
    if (saved.content) {
      const a = document.createElement('a');
      a.href = saved.content;
      a.download = saved.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('File diunduh dari penyimpanan lokal.');
      return;
    }

    // File ada di server → unduh lewat endpoint unduhan publik (header attachment).
    try {
      showToast('Mengunduh file dari server...');
      const a = document.createElement('a');
      a.href = API_DOWNLOAD + '?courseId=' + encodeURIComponent(courseId) + '&meetingNo=' + meetingNo;
      a.download = saved.name || 'tugas';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      showToast('Server tidak terjangkau — file tidak dapat diunduh.');
    }
  }

  /* ======================================================================
   *  SINKRONISASI SERVER → LOKAL (hanya mode ADMIN — menulis localStorage)
   *  MySQL via API PHP menjadi sumber kebenaran bersama antar perangkat:
   *  - Tugas yang ada di server tapi belum ada di browser ini → ditandai
   *    sebagai file "remote" (bisa diunduh, ikut menghitung progress).
   *  - Materi pertemuan (judul/deskripsi/catatan/status) yang belum ada
   *    di browser ini → ditarik dari server.
   *  Semua best-effort: kalau server tidak terjangkau, data lokal utuh.
   * ====================================================================== */
  async function syncFromServer() {
    if (accessMode !== 'admin') return;

    try {
      const res = await apiJson(API_ASSIGNMENT + '?list=1');
      (res.data || []).forEach((row) => {
        const key = 'course_assignment_' + row.courseId + '_m_' + row.meetingNo;
        const local = meetingFile(row.courseId, row.meetingNo);
        if (!local) {
          localStorage.setItem(key, JSON.stringify({
            name: row.fileName,
            size: row.fileSize,
            content: null,
            gdriveUrl: GDRIVE_FOLDER_URL,
            synced: true,
            remote: true
          }));
        }
      });
    } catch (e) { /* server tidak terjangkau — lanjut dengan data lokal */ }

    try {
      const res2 = await apiJson(API_MEETING_META + '?list=1');
      (res2.data || []).forEach((row) => {
        const key = 'course_meeting_' + row.courseId + '_m_' + row.meetingNo;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify({
            title: row.title || '',
            desc: row.desc || '',
            notes: row.notes || '',
            done: Boolean(row.done),
            remote: true
          }));
        }
      });
    } catch (e) { /* abaikan */ }

    renderSemesterTabs();
    renderCourseList();
  }

  /* ======================================================================
   *  PROJECTS — IMPERIAL GALLERY (CREATE / READ / UPDATE / DELETE)
   * ====================================================================== */
  function loadProjects() {
    const saved = localStorage.getItem('user_projects');
    if (saved) {
      try { projects = JSON.parse(saved); } catch (e) { projects = []; }
    } else {
      projects = [];
    }
    renderProjects();
  }

  function statusClass(status) {
    if (status === 'Selesai') return 'gold';
    if (status === 'Rencana') return 'burgundy';
    return '';
  }

  function renderProjects() {
    const list = $('#project-list');
    const empty = $('#projects-empty');
    if (!list || !empty) return;

    if (!projects.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    list.innerHTML = projects.map((p, i) => {
      const initial = escapeHtml((p.name || 'P').trim().charAt(0).toUpperCase() || 'P');
      const safeLink = safeExternalUrl(p.link);
      const link = safeLink
        ? `<a class="btn btn-secondary btn-small" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">
             <i class="fa-brands fa-github"></i> Lihat Proyek</a>`
        : '';
      return `
      <article class="project-card" data-tilt>
        <div class="project-visual">
          <span class="project-glyph">${initial}</span>
          <i class="fa-solid fa-${['landmark', 'scroll', 'column', 'monument', 'archway'][i % 5]}"></i>
        </div>
        <div class="project-body">
          <div class="project-top">
            <h3 class="project-name">${escapeHtml(p.name)}</h3>
            <span class="project-status ${statusClass(p.status)}">${escapeHtml(p.status || '')}</span>
          </div>
          <p class="project-desc">${escapeHtml(p.description)}</p>
          <p class="project-tech">Tech: ${escapeHtml(p.tech || '-')}</p>
          <div class="project-actions">
            ${link}
            <button class="icon-btn" data-action="edit" type="button" title="Edit Proyek" aria-label="Edit proyek"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn" data-action="delete" type="button" title="Hapus Proyek" aria-label="Hapus proyek"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </article>`;
    }).join('');

    list.querySelectorAll('.project-card').forEach((card, idx) => {
      const p = projects[idx];
      card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openProjectForm(p.id));
      card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteProject(p.id));
    });

    if (window.IMPERIUM) window.IMPERIUM.refresh();
  }

  function openProjectForm(projectId = null) {
    const wrap = $('#project-form-wrap');
    const title = $('#project-form-title');
    if (!wrap) return;

    if (projectId) {
      const p = projects.find((item) => item.id === projectId);
      if (!p) return;
      title.textContent = 'Edit Proyek';
      $('#project-id').value = p.id;
      $('#project-name').value = p.name;
      $('#project-description').value = p.description;
      $('#project-tech').value = p.tech || '';
      $('#project-status').value = p.status || 'Dalam proses';
      $('#project-link').value = p.link || '';
    } else {
      title.textContent = 'Tambah Proyek';
      $('#project-form').reset();
      $('#project-id').value = '';
    }

    wrap.classList.remove('hidden');
    wrap.scrollIntoView({ behavior: window.IMPERIUM && !window.IMPERIUM.reduced ? 'smooth' : 'auto', block: 'center' });
  }
  function closeProjectForm() { $('#project-form-wrap')?.classList.add('hidden'); }

  function handleProjectSubmit(e) {
    e.preventDefault();
    const id = $('#project-id').value;
    const name = $('#project-name').value.trim();
    const description = $('#project-description').value.trim();
    const tech = $('#project-tech').value.trim();
    const status = $('#project-status').value;
    const link = $('#project-link').value.trim();
    if (!name) return;

    if (id) {
      const idx = projects.findIndex((p) => p.id === id);
      if (idx !== -1) {
        projects[idx] = { ...projects[idx], name, description, tech, status, link };
        showToast('Proyek diperbarui!');
      }
    } else {
      const newId = 'p_' + Date.now();
      projects.push({ id: newId, name, description, tech, status, link });
      showToast('Proyek ditambahkan!');
    }

    localStorage.setItem('user_projects', JSON.stringify(projects));
    renderProjects();
    closeProjectForm();
  }

  function deleteProject(id) {
    if (!confirm('Hapus proyek ini?')) return;
    projects = projects.filter((p) => p.id !== id);
    localStorage.setItem('user_projects', JSON.stringify(projects));
    renderProjects();
    showToast('Proyek dihapus.');
  }

  /* ======================================================================
   *  FOTO PROFIL — frame klasik + navbar (localStorage)
   * ====================================================================== */
  function initAvatar() {
    const avatarInput = $('#avatar-input');
    const profileImg = $('#profile-img');
    const profilePlaceholder = $('#profile-placeholder');
    const removeBtn = $('#remove-photo-btn');
    const navImg = $('#nav-avatar-img');
    const navIcon = $('#nav-avatar-icon');

    const savedAvatar = localStorage.getItem('profile_avatar');
    if (savedAvatar) applyAvatar(savedAvatar);

    avatarInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Image = event.target.result;
        localStorage.setItem('profile_avatar', base64Image);
        applyAvatar(base64Image);
        showToast('Foto profil berhasil diperbarui!');
      };
      reader.readAsDataURL(file);
    });

    removeBtn?.addEventListener('click', () => {
      localStorage.removeItem('profile_avatar');
      profileImg.src = '';
      profileImg.classList.add('hidden');
      profilePlaceholder.classList.remove('hidden');
      removeBtn.classList.add('hidden');
      navImg.src = '';
      navImg.classList.add('hidden');
      navIcon.classList.remove('hidden');
      if (avatarInput) avatarInput.value = '';
      showToast('Foto profil dihapus.');
    });

    function applyAvatar(base64) {
      if (profileImg) {
        profileImg.src = base64;
        profileImg.classList.remove('hidden');
      }
      if (profilePlaceholder) profilePlaceholder.classList.add('hidden');
      if (removeBtn) removeBtn.classList.remove('hidden');
      if (navImg) {
        navImg.src = base64;
        navImg.classList.remove('hidden');
      }
      if (navIcon) navIcon.classList.add('hidden');
    }
  }

  /* ======================================================================
   *  BOOT
   * ====================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initForms();
    initGate();
    initCourseListEvents();
    initMeetingModal();
    initAvatar();
    loadProjects();
    renderSemesterTabs();
    renderCourseList();
    restoreAccess(); // cek session Admin di server → pilih mode (gerbang bila belum)
  });
})();
