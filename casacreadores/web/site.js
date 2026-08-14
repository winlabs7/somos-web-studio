(function () {
  const STUDIO = [
    "/img/estudio-piso-podcast-bts.jpg",
    "/img/estudio-lounge-warm.jpg",
    "/img/estudio-set-streaming-perfume.jpg",
    "/img/estudio-set-beauty-live.jpg",
    "/img/estudio-podcast-1.jpg",
    "/img/estudio-vanity-led.jpg",
    "/img/estudio-estanteria-beauty.jpg",
    "/img/estudio-escritorio-rosa-1.jpg",
    "/img/estudio-escritorio-rosa-2.jpg",
    "/img/estudio-lounge-ambar.jpg",
    "/img/estudio-nook-lectura.jpg",
    "/img/estudio-podcast-2.jpg",
    "/img/estudio-camara-sony.jpg",
    "/img/estudio-set-mariposa-en-uso.jpg",
    "/img/estudio-set-mariposa.jpg"
  ];

  function fillMarq(el, list) {
    if (!el) return;
    const loop = list.concat(list);
    el.innerHTML = loop.map(function (src) {
      const idx = STUDIO.indexOf(src);
      return '<button type="button" data-lb="' + idx + '"><img src="' + src + '" alt=""></button>';
    }).join("");
  }

  const marqA = document.getElementById("marqA");
  const marqB = document.getElementById("marqB");
  if (marqA) fillMarq(marqA, STUDIO.slice(1, 8));
  if (marqB) fillMarq(marqB, STUDIO.slice(8));

  const menuBtn = document.getElementById("menuBtn");
  const navMobile = document.getElementById("navMobile");
  function closeMenu() {
    if (!menuBtn || !navMobile) return;
    menuBtn.classList.remove("is-open");
    navMobile.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  if (menuBtn && navMobile) {
    menuBtn.addEventListener("click", function () {
      const open = !navMobile.classList.contains("is-open");
      menuBtn.classList.toggle("is-open", open);
      navMobile.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    navMobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
  }

  const overlay = document.getElementById("modalOverlay");
  const MODALS = window.CASA_MODALS || {};
  function openModal(id) {
    if (!overlay) return;
    const d = MODALS[id];
    if (!d) return;
    document.getElementById("modalKicker").textContent = d.kicker;
    document.getElementById("modalTitle").textContent = d.title;
    document.getElementById("modalBody").innerHTML = d.body;
    overlay.hidden = false;
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(function () { overlay.hidden = true; }, 300);
  }
  if (overlay) {
    document.querySelectorAll("[data-modal]").forEach(function (el) {
      el.addEventListener("click", function () { openModal(el.dataset.modal); });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openModal(el.dataset.modal);
        }
      });
    });
    const modalClose = document.getElementById("modalClose");
    if (modalClose) modalClose.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
      if (e.target.closest('a[href="#aplicar"]')) closeModal();
    });
  }

  document.querySelectorAll(".verb").forEach(function (row) {
    row.addEventListener("click", function () { row.classList.toggle("open"); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        row.classList.toggle("open");
      }
    });
  });

  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbCount = document.getElementById("lbCount");
  let lbIndex = 0;
  function showLb(i) {
    if (!lbImg || !lbCount) return;
    lbIndex = (i + STUDIO.length) % STUDIO.length;
    lbImg.src = STUDIO[lbIndex];
    lbCount.textContent = (lbIndex + 1) + " / " + STUDIO.length;
  }
  function openLb(i) {
    if (!lb) return;
    showLb(i);
    lb.hidden = false;
    requestAnimationFrame(function () { lb.classList.add("is-open"); });
    document.body.style.overflow = "hidden";
  }
  function closeLb() {
    if (!lb) return;
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(function () { lb.hidden = true; }, 300);
  }
  if (lb) {
    document.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-lb]");
      if (btn) openLb(+btn.dataset.lb);
    });
    const lbClose = document.getElementById("lbClose");
    const lbPrev = document.getElementById("lbPrev");
    const lbNext = document.getElementById("lbNext");
    if (lbClose) lbClose.addEventListener("click", closeLb);
    if (lbPrev) lbPrev.addEventListener("click", function () { showLb(lbIndex - 1); });
    if (lbNext) lbNext.addEventListener("click", function () { showLb(lbIndex + 1); });
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMenu();
      closeModal();
      closeLb();
    }
    if (!lb || !lb.classList.contains("is-open")) return;
    if (e.key === "ArrowLeft") showLb(lbIndex - 1);
    if (e.key === "ArrowRight") showLb(lbIndex + 1);
  });

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) e.target.classList.add("visible");
    });
  }, { threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  const statsBar = document.getElementById("statsBar");
  if (statsBar) {
    let counted = false;
    const statsIo = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || counted) return;
      counted = true;
      statsBar.classList.add("is-counting");
      statsBar.querySelectorAll("[data-count]").forEach(function (el) {
        const end = +el.dataset.count;
        const start = performance.now();
        const dur = 1100;
        const tick = function (now) {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(end * eased);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.35 });
    statsIo.observe(statsBar);
  }

  const typeEl = document.getElementById("studioType");
  if (typeEl) {
    let typed = false;
    const typeIo = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || typed) return;
      typed = true;
      const text = typeEl.dataset.text || "";
      let i = 0;
      const step = function () {
        typeEl.textContent = text.slice(0, i);
        i++;
        if (i <= text.length) setTimeout(step, 42);
      };
      step();
    }, { threshold: 0.4 });
    typeIo.observe(typeEl);
  }
})();
