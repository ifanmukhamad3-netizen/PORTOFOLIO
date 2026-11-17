/* ============================================================================
   IMPERIUM — THE DIGITAL EMPIRE · CINEMA ENGINE
   Loading screen · Tab switching · Particles · Cursor · Parallax · Reveals
   ------------------------------------------------------------------
   LAYOUT: Tabbed view mode (html.tabs-mode). Hanya satu .section tampil
   pada satu waktu. Klik nav-link / anchor internal = pindah tab, bukan
   scroll antar-section. Scroll tetap berlaku di dalam tab yang tinggi.
   Teknologi: GSAP + ScrollTrigger + Lenis (di-vendor lokal) + Canvas 2D.
   Semua efek dinonaktifkan secara bertahap pada perangkat sentuh dan
   prefers-reduced-motion agar performa & aksesibilitas tetap terjaga.
   ========================================================================== */
(function () {
  'use strict';

  const doc = document;
  const root = doc.documentElement;

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE_POINTER = window.matchMedia('(pointer: fine)').matches;
  const HAS_GSAP = typeof window.gsap !== 'undefined';
  const HAS_ST = HAS_GSAP && typeof window.ScrollTrigger !== 'undefined';

  root.classList.remove('no-js');
  root.classList.add('js');
  if (HAS_GSAP && !REDUCED) root.classList.add('anim-ready');

  const $ = (sel, ctx) => (ctx || doc).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || doc).querySelectorAll(sel));

  /* ------------------------------------------------------------------ *
   *  Roman numerals — untuk progres loading bergaya kekaisaran
   * ------------------------------------------------------------------ */
  const ROMAN = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
    [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  function toRoman(n) {
    n = Math.max(0, Math.min(1000, Math.round(n)));
    if (n === 0) return '·';
    let out = '';
    for (const [v, s] of ROMAN) { while (n >= v) { out += s; n -= v; } }
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  1. LOADING SCREEN — Gate of the Empire
   * ------------------------------------------------------------------ */
  const loader = $('#loader');
  const loaderFill = $('#loader-fill');
  const loaderNum = $('#loader-numeral');
  const loaderPct = $('#loader-pct');

  function hideLoaderInstant() {
    if (!loader) return;
    loader.style.transition = 'opacity .3s ease';
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 320);
    unlockScroll();
  }

  function lockScroll() {
    doc.body.style.overflow = 'hidden';
    if (lenis) lenis.stop();
  }
  function unlockScroll() {
    doc.body.style.overflow = '';
    if (lenis) lenis.start();
  }

  function runLoader() {
    if (!loader) { startIntro(); return; }

    if (REDUCED || !HAS_GSAP) { hideLoaderInstant(); startIntro(); return; }

    lockScroll();

    const tlIn = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tlIn
      .fromTo('.loader-laurel', { opacity: 0, scale: 0.7, y: -14 },
        { opacity: 0.9, scale: 1, y: 0, duration: 0.9, ease: 'power2.out' })
      .to('.loader-word span', {
        opacity: 1, y: 0, rotateX: 0,
        duration: 0.85, stagger: 0.065, ease: 'power4.out'
      }, '-=0.45')
      .to('.loader-sub', { opacity: 1, duration: 0.6 }, '-=0.35')
      .to(['.loader-progress', '.loader-meander'], { opacity: 1, duration: 0.6, stagger: 0.12 }, '-=0.3');

    // Progres: simulasi halus, menunggu window load (maks 2.6 dtk)
    const progress = { p: 0 };
    let loaded = doc.readyState === 'complete';
    if (!loaded) window.addEventListener('load', () => { loaded = true; }, { once: true });

    const startedAt = performance.now();
    gsap.to(progress, {
      p: 100,
      duration: 1.7,
      ease: 'power1.inOut',
      onUpdate() {
        // Tahan di 92% sampai halaman benar-benar selesai dimuat
        const elapsed = performance.now() - startedAt;
        const cap = loaded || elapsed > 2600 ? 100 : 92;
        progress.p = Math.min(progress.p, cap);
        const v = Math.round(progress.p);
        if (loaderFill) loaderFill.style.width = v + '%';
        if (loaderNum) loaderNum.textContent = toRoman(v);
        if (loaderPct) loaderPct.textContent = v + '%';
      },
      onComplete: () => {
        gsap.delayedCall(0.18, () => {
          gsap.timeline({
            onComplete() {
              loader.style.display = 'none';
              unlockScroll();
              startIntro();
            }
          })
            .to('.loader-inner', { opacity: 0, y: -26, duration: 0.5, ease: 'power2.in', stagger: 0.04 })
            .to('.loader-meander', { opacity: 0, duration: 0.3 }, '<')
            .to('.gate-left',  { xPercent: -102, duration: 1.15, ease: 'power4.inOut' }, '-=0.1')
            .to('.gate-right', { xPercent: 102, duration: 1.15, ease: 'power4.inOut' }, '<');
        });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  2. HERO INTRO — pilar naik, judul stagger, ornamen bercahaya
   * ------------------------------------------------------------------ */
  function startIntro() {
    if (!HAS_GSAP || REDUCED) { handleInitialHash(); return; }
    handleInitialHash();

    gsap.set('.ht-letter', { y: 130, opacity: 0, rotateX: 42 });
    gsap.set(['.hero-eyebrow', '.hero-tagline', '.hero-name', '.hero-cta', '.hero-meta'], { y: 30, opacity: 0 });
    gsap.set('.hero-emblem', { scale: 0.55, opacity: 0 });
    gsap.set('.hero-pillar', { y: 170, opacity: 0 });
    gsap.set('.hero-arch', { opacity: 0, y: -34 });
    gsap.set('.hero-floor', { opacity: 0 });
    gsap.set('.hero-scroll', { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl
      .to('.hero-pillar.p1, .hero-pillar.p4', { y: 0, opacity: 0.85, duration: 1.35, ease: 'power4.out' }, 0.05)
      .to('.hero-pillar.p2, .hero-pillar.p5', { y: 0, opacity: 0.5, duration: 1.25, ease: 'power4.out' }, 0.16)
      .to('.hero-pillar.p3, .hero-pillar.p6', { y: 0, opacity: 0.26, duration: 1.2, ease: 'power4.out' }, 0.26)
      .to('.hero-arch', { opacity: 0.5, y: 0, duration: 1.1 }, 0.35)
      .to('.hero-floor', { opacity: 1, duration: 1.2 }, 0.4)
      .to('.hero-emblem', { scale: 1, opacity: 0.95, duration: 1.0, ease: 'back.out(1.6)' }, 0.45)
      .to('.ht-letter', { y: 0, opacity: 1, rotateX: 0, duration: 1.1, stagger: 0.075, ease: 'power4.out' }, 0.55)
      .to('.hero-eyebrow', { y: 0, opacity: 1, duration: 0.8 }, 1.0)
      .to('.hero-tagline', { y: 0, opacity: 1, duration: 0.85 }, 1.14)
      .to('.hero-name', { y: 0, opacity: 1, duration: 0.85 }, 1.26)
      .to('.hero-cta', { y: 0, opacity: 1, duration: 0.85 }, 1.38)
      .to('.hero-meta', { y: 0, opacity: 1, duration: 0.85 }, 1.5)
      .to('.hero-scroll', { opacity: 1, duration: 0.9 }, 1.7);

    // Parallax saat keluar dari hero (scrub sinematik)
    if (HAS_ST) {
      gsap.to('.hero-content', {
        y: -110, opacity: 0.15, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
      gsap.to('.hero-stage', {
        y: 90, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
      gsap.to('.hero-vignette', {
        opacity: 0.35, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: '40% top', end: 'bottom top', scrub: 0.6 }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   *  3. LENIS SMOOTH SCROLL + integrasi ScrollTrigger
   * ------------------------------------------------------------------ */
  let lenis = null;
  // Kita kelola scroll sendiri (Lenis + hash routing) — cegah browser
  // memulihkan posisi scroll lama yang bisa menimpa scroll hash.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // Catatan: di mode tab (html.tabs-mode), Lenis tidak diinisialisasi karena
  // state internalnya bentrok dengan window.scrollTo(0,0) saat pindah tab.
  // Smooth scroll dalam tab ditangani CSS `scroll-behavior: smooth` (html).
  const TABS_MODE = doc.documentElement.classList.contains('tabs-mode');
  if (typeof window.Lenis !== 'undefined' && !REDUCED && !TABS_MODE) {
    try {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1 });
      if (HAS_ST) {
        lenis.on('scroll', window.ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    } catch (e) { lenis = null; }
  }

  function switchTab(hash, push = true) {
    const map = { dashboard: '#hero', hero: '#hero', about: '#about', academic: '#academic',
      skills: '#skills', projects: '#projects', journey: '#journey' };
    const sel = map[(hash || '').replace('#', '')];
    if (!sel) return false;
    const el = $(sel);
    if (!el) return false;

    // Tidak ada perubahan = tidak perlu kerja ulang
    if (el.classList.contains('is-active')) {
      // tetap update nav & hash supaya sinkron
      setActiveSection(sel.replace('#', ''));
      return true;
    }

    // Sembunyikan dulu SEMUA section → page height mengecil drastis (navbar + footer
    // saja), sehingga window.scrollTo benar-benar reset ke 0 tanpa di-cap oleh
    // konten section sebelumnya. Pakai behavior:'instant' agar tidak terkena
    // animasi smooth-scroll CSS yang bisa tertinggal di posisi tengah.
    $$('.section').forEach((s) => s.classList.remove('is-active'));

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (lenis) {
      try { lenis.scrollTo(0, { immediate: true }); } catch (e) {}
    }

    // Baru tampilkan section target
    el.classList.add('is-active');

    // Update nav-link aktif + indikator
    setActiveSection(sel.replace('#', ''));

    // Refresh ScrollTrigger supaya reveal & parallax di tab baru
    // mengevaluasi ulang posisi (sebelumnya section display:none).
    if (HAS_ST) {
      requestAnimationFrame(() => {
        try { window.ScrollTrigger.refresh(); } catch (e) {}
      });
    }

    // Update URL hash. push=true (klik user) → pushState agar back/forward
    // bisa navigasi antar tab. push=false (init / popstate) → jangan sentuh history.
    if (push && history.pushState) {
      history.pushState(null, '', sel);
    }
    return true;
  }

  // Alias lama — dipakai script.js via window.IMPERIUM.scrollTo.
  function scrollToTarget(hash, smooth = true) {
    return switchTab(hash, true);
  }

  // Delegasi klik untuk semua tautan anchor internal — sekarang pindah tab
  doc.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href.length < 2) return;
    if (switchTab(href, true)) {
      e.preventDefault();
      closeMobileMenu();
    }
  });

  // Back / Forward button
  window.addEventListener('popstate', () => {
    const h = window.location.hash && window.location.hash.length > 1
      ? window.location.hash : '#hero';
    switchTab(h, false);
  });

  // Hash lama (#dashboard) atau langsung ke section tertentu tetap berfungsi
  function handleInitialHash() {
    const h = window.location.hash && window.location.hash.length > 1
      ? window.location.hash : '#hero';
    // Beri delay kecil agar layout & loader selesai, lalu pindah tab.
    setTimeout(() => switchTab(h, false), 120);
  }

  /* ------------------------------------------------------------------ *
   *  4. NAVBAR — glass saat scroll, indikator section aktif, burger
   * ------------------------------------------------------------------ */
  const navbar = $('#navbar');
  const indicator = $('#nav-indicator');
  const navLinks = $$('.nav-link');
  const SECTIONS = ['hero', 'about', 'academic', 'skills', 'projects', 'journey'];

  function updateNavbarScrolled() {
    if (!navbar) return;
    const y = window.pageYOffset;
    navbar.classList.toggle('scrolled', y > 56);
  }
  window.addEventListener('scroll', updateNavbarScrolled, { passive: true });
  updateNavbarScrolled();

  function moveIndicator(link) {
    if (!indicator || !link) return;
    indicator.style.left = link.offsetLeft + 'px';
    indicator.style.width = link.offsetWidth + 'px';
    indicator.classList.add('ready');
  }

  let _lastActive = null;
  function setActiveSection(id) {
    if (id === _lastActive) return;
    _lastActive = id;
    navLinks.forEach((l) => {
      const on = l.getAttribute('href') === '#' + id;
      l.classList.toggle('active', on);
      if (on) moveIndicator(l);
    });
    // Catatan: update URL hash ditangani oleh switchTab() (pushState/replaceState).
    // Jangan dilakukan di sini agar tidak bentrok dengan pushState untuk back/forward.
  }

  function initTabs() {
    // Mode tab: tidak ada scroll-spy. Cukup sinkronkan indikator nav
    // dengan section yang sedang aktif (di-set oleh switchTab).
    function syncIndicator() {
      const active = $('.nav-link.active');
      if (active) moveIndicator(active);
    }
    window.addEventListener('resize', syncIndicator);
    requestAnimationFrame(syncIndicator);
    // Set state awal dari hash URL (atau default #hero)
    const h = window.location.hash && window.location.hash.length > 1
      ? window.location.hash : '#hero';
    switchTab(h, false);
  }

  // Burger / mobile menu
  const burger = $('#nav-burger');
  function closeMobileMenu() {
    doc.body.classList.remove('menu-open');
    if (burger) { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Buka menu'); }
    $('#mobile-menu')?.setAttribute('aria-hidden', 'true');
    if (lenis) lenis.start();
  }
  if (burger) {
    burger.addEventListener('click', () => {
      const open = doc.body.classList.toggle('menu-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
      $('#mobile-menu')?.setAttribute('aria-hidden', String(!open));
      if (lenis) open ? lenis.stop() : lenis.start();
    });
  }

  /* ------------------------------------------------------------------ *
   *  5. GOLD DUST — partikel debu keemasan (Canvas 2D, ringan)
   * ------------------------------------------------------------------ */
  function startDust() {
    const canvas = $('#gold-dust');
    if (!canvas || REDUCED) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = 0, H = 0, DPR = 1, particles = [], rafId = null, running = true;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = W * DPR; canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = W < 768 ? 26 : (W < 1200 ? 46 : 68);
      particles = Array.from({ length: count }, () => spawn(true));
    }
    function spawn(anywhere) {
      const big = Math.random() < 0.12;
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : H + 10,
        r: big ? 2.2 + Math.random() * 2.4 : 0.6 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.08 + Math.random() * 0.28),
        a: 0.16 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        tw: 0.004 + Math.random() * 0.012,
        big
      };
    }
    function frame() {
      if (!running) { rafId = null; return; }
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx + Math.sin(p.phase += p.tw) * 0.14;
        p.y += p.vy;
        if (p.y < -12 || p.x < -12 || p.x > W + 12) particles[i] = spawn(false);
        const tw = 0.65 + Math.sin(p.phase * 2.2) * 0.35;
        const alpha = p.a * tw;
        ctx.beginPath();
        if (p.big) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.4);
          g.addColorStop(0, 'rgba(228,196,134,' + (alpha * 0.5).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(228,196,134,0)');
          ctx.fillStyle = g;
          ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
        } else {
          ctx.fillStyle = 'rgba(228,196,134,' + alpha.toFixed(3) + ')';
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      rafId = requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener('resize', resize);
    doc.addEventListener('visibilitychange', () => {
      running = !doc.hidden;
      if (running && !rafId) rafId = requestAnimationFrame(frame);
    });
    rafId = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   *  6. MOUSE DEPTH — kedalaman objek mengikuti mouse (desktop)
   * ------------------------------------------------------------------ */
  function startMouseDepth() {
    if (!FINE_POINTER || REDUCED || !HAS_GSAP) return;
    const hero = $('#hero');
    if (!hero) return;
    const layers = $$('.hero-layer[data-depth]', hero);
    const content = $('.hero-content', hero);
    let targetX = 0, targetY = 0, curX = 0, curY = 0, raf = null;

    function loop() {
      curX += (targetX - curX) * 0.055;
      curY += (targetY - curY) * 0.055;
      layers.forEach((layer) => {
        const d = parseFloat(layer.dataset.depth || '0.5');
        layer.style.transform = 'translate3d(' + (curX * d * 46).toFixed(2) + 'px,' + (curY * d * 30).toFixed(2) + 'px,0)';
      });
      if (content) {
        content.style.transform = 'translate3d(' + (curX * 10).toFixed(2) + 'px,' + (curY * 7).toFixed(2) + 'px,0)';
      }
      raf = requestAnimationFrame(loop);
    }
    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      targetX = (e.clientX - r.left) / r.width - 0.5;
      targetY = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    hero.addEventListener('mouseleave', () => { targetX = 0; targetY = 0; });
  }

  /* ------------------------------------------------------------------ *
   *  7. CUSTOM CURSOR — lingkaran emas + ring (desktop only)
   * ------------------------------------------------------------------ */
  function startCursor() {
    if (!FINE_POINTER || REDUCED) return;
    const dot = $('#cursor-dot');
    const ring = $('#cursor-ring');
    if (!dot || !ring) return;
    root.classList.add('cursor-on');

    let mx = innerWidth / 2, my = innerHeight / 2, dx = mx, dy = my, rx = mx, ry = my;
    let shown = false;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; dot.style.opacity = ''; ring.style.opacity = ''; }
    }, { passive: true });

    (function loop() {
      dx += (mx - dx) * 0.42; dy += (my - dy) * 0.42;
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      dot.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translate(-50%,-50%)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();

    const HOVER_SEL = 'a, button, .course-card, .tab-btn, .mpill, label, input, textarea, select, [data-cursor="hover"]';
    doc.addEventListener('mouseover', (e) => {
      ring.classList.toggle('is-hover', Boolean(e.target.closest(HOVER_SEL)));
    });
    doc.addEventListener('mousedown', () => ring.classList.add('is-press'));
    doc.addEventListener('mouseup', () => ring.classList.remove('is-press'));
    doc.addEventListener('mouseleave', () => { dot.style.opacity = 0; ring.style.opacity = 0; });
    doc.addEventListener('mouseenter', () => { dot.style.opacity = ''; ring.style.opacity = ''; });
  }

  /* ------------------------------------------------------------------ *
   *  8. MAGNETIC BUTTONS + RIPPLE
   * ------------------------------------------------------------------ */
  function startMagnetic() {
    if (!FINE_POINTER || REDUCED) return;
    $$('.btn-magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const relX = e.clientX - r.left - r.width / 2;
        const relY = e.clientY - r.top - r.height / 2;
        btn.style.transition = 'transform .18s ease-out';
        btn.style.transform = 'translate(' + relX * 0.22 + 'px,' + (relY * 0.28 - 2) + 'px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transition = 'transform .5s cubic-bezier(0.22,0.75,0.25,1)';
        btn.style.transform = '';
      });
    });
  }

  function startRipple() {
    doc.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn || REDUCED) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.15;
      const ink = doc.createElement('span');
      ink.className = 'ripple-ink';
      ink.style.width = ink.style.height = size + 'px';
      ink.style.left = (e.clientX - r.left - size / 2) + 'px';
      ink.style.top = (e.clientY - r.top - size / 2) + 'px';
      btn.appendChild(ink);
      setTimeout(() => ink.remove(), 700);
    });
  }

  /* ------------------------------------------------------------------ *
   *  9. 3D TILT — portrait frame & kartu (desktop only)
   * ------------------------------------------------------------------ */
  function startTilt() {
    if (!FINE_POINTER || REDUCED) return;
    $$('#tilt-portrait, [data-tilt]').forEach((stage) => {
      const target = stage.matches('.portrait-frame') ? stage : stage.querySelector('.portrait-frame') || stage;
      const MAX = 8;
      stage.addEventListener('mousemove', (e) => {
        const r = stage.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        target.style.transition = 'transform .12s ease-out';
        target.style.transform =
          'perspective(950px) rotateX(' + (-py * MAX).toFixed(2) + 'deg) rotateY(' + (px * MAX * 1.25).toFixed(2) + 'deg) translateY(-3px)';
      });
      stage.addEventListener('mouseleave', () => {
        target.style.transition = 'transform .8s cubic-bezier(0.22,0.75,0.25,1)';
        target.style.transform = '';
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  10. SCROLL REVEAL — seluruh section bernyanyi saat di-scroll
   * ------------------------------------------------------------------ */
  function startReveals() {
    if (!HAS_ST) return;

    window.ScrollTrigger.batch('[data-reveal]', {
      start: 'top 87%',
      once: true,
      onEnter: (batch) => {
        gsap.to(batch, {
          opacity: 1, x: 0, y: 0, scale: 1, rotateX: 0,
          duration: 1.0, ease: 'power3.out', stagger: 0.09, overwrite: true
        });
      }
    });

    // Judul section: efek huruf naik perlahan (split sederhana per kata em)
    $$('.section-title').forEach((title) => {
      gsap.from(title, {
        opacity: 0, y: 26, letterSpacing: '0.2em',
        duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: title, start: 'top 88%', once: true }
      });
    });

    // Divider memanjang dari tengah
    $$('.sh-divider').forEach((div) => {
      gsap.from(div, {
        scaleX: 0, opacity: 0, duration: 1.0, ease: 'power3.out',
        scrollTrigger: { trigger: div, start: 'top 90%', once: true }
      });
    });

    // Timeline journey: garis emas tumbuh
    const timeline = $('#timeline');
    if (timeline) {
      gsap.from(timeline, {
        '--lineScale': 1, // placeholder (CSS handles visual)
        scrollTrigger: { trigger: timeline, start: 'top 82%', once: true,
          onEnter: () => timeline.classList.add('line-grown') }
      });
      gsap.from($$('.timeline-item', timeline), {
        opacity: 0, x: -40, duration: 0.9, ease: 'power3.out', stagger: 0.16,
        scrollTrigger: { trigger: timeline, start: 'top 80%', once: true }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   *  11. PUBLIC API — dipakai script.js (render ulang kartu, dsb.)
   * ------------------------------------------------------------------ */
  window.IMPERIUM = {
    scrollTo: scrollToTarget,
    refresh: () => { if (HAS_ST) window.ScrollTrigger.refresh(); },
    animateCards: animateNewCards,
    reduced: REDUCED,
    lenis: () => lenis
  };

  // Kartu mata kuliah baru: muncul dengan stagger 3D saat masuk viewport
  function animateNewCards(container) {
    if (!HAS_ST || REDUCED || !container) return 0;
    const cards = $$('.course-card:not([data-reveal-bound])', container);
    cards.forEach((c) => c.setAttribute('data-reveal-bound', '1'));
    if (!cards.length) return 0;
    window.ScrollTrigger.batch(cards, {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => {
        gsap.fromTo(batch,
          { opacity: 0, y: 56, rotateX: 14, scale: 0.95 },
          { opacity: 1, y: 0, rotateX: 0, scale: 1, duration: 0.95, ease: 'power3.out', stagger: 0.09, overwrite: true, clearProps: 'transform' });
      }
    });
    return cards.length;
  }

  /* ------------------------------------------------------------------ *
   *  BOOT
   * ------------------------------------------------------------------ */
  function boot() {
    if (HAS_ST) gsap.registerPlugin(window.ScrollTrigger);
    startDust();
    startMouseDepth();
    startCursor();
    startMagnetic();
    startRipple();
    startTilt();
    initTabs();
    if (HAS_ST) startReveals();
    runLoader();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
