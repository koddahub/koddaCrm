(function () {
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;

  const navLinks = Array.from(nav.querySelectorAll('a[href]'));
  const sectionLinks = navLinks.filter((link) => {
    const href = String(link.getAttribute('href') || '');
    return href.startsWith('#') && href.length > 1;
  });

  function closeNav() {
    nav.classList.remove('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  function openNav() {
    nav.classList.add('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'true');
  }

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      if (nav.classList.contains('open')) {
        closeNav();
      } else {
        openNav();
      }
    });
  }

  document.addEventListener('click', function (event) {
    const target = event.target;
    if (!target || !(target instanceof Node)) return;
    if (!nav.classList.contains('open')) return;
    if (nav.contains(target)) return;
    if (navToggle && navToggle.contains(target)) return;
    closeNav();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeNav();
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', function () {
      if (window.innerWidth <= 768) closeNav();
    });
  });

  sectionLinks.forEach((anchor) => {
    anchor.addEventListener('click', function (event) {
      const id = anchor.getAttribute('href');
      if (!id) return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function syncActiveLink() {
    const y = window.scrollY + 120;
    let activeId = '#topo';
    sectionLinks.forEach((link) => {
      const id = link.getAttribute('href');
      if (!id) return;
      const section = document.querySelector(id);
      if (!section) return;
      if (y >= section.offsetTop) activeId = id;
    });
    sectionLinks.forEach((link) => {
      if (link.getAttribute('href') === activeId) link.classList.add('active');
      else link.classList.remove('active');
    });
  }

  window.addEventListener('scroll', syncActiveLink, { passive: true });
  syncActiveLink();
})();
