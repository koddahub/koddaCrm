(function () {
  const cfg = window.TemplateConfig || {};
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  const navLinks = Array.from(document.querySelectorAll('[data-nav] a[href]'));

  function normalizePath(href) {
    return String(href || '').replace(/^\.\//, '').split('#')[0] || 'index.html';
  }

  function currentPage() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    return path === '' ? 'index.html' : path;
  }

  function setActiveNav() {
    const page = currentPage();
    navLinks.forEach((link) => {
      const href = normalizePath(link.getAttribute('href'));
      if (href === page) link.classList.add('active');
      else link.classList.remove('active');
    });
  }

  function closeNav() {
    if (!nav) return;
    nav.classList.remove('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  function openNav() {
    if (!nav) return;
    nav.classList.add('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'true');
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      if (nav.classList.contains('open')) closeNav();
      else openNav();
    });
    document.addEventListener('click', function (event) {
      const target = event.target;
      if (!target || !(target instanceof Node)) return;
      if (!nav.classList.contains('open')) return;
      if (nav.contains(target)) return;
      if (navToggle.contains(target)) return;
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
  }

  function applyContactConfig() {
    const phoneDigits = String(cfg.whatsappNumber || '5511999999999').replace(/\D/g, '');
    const email = String(cfg.contactEmail || 'contato@suaempresa.com.br');
    const phoneLabel = String(cfg.contactPhone || '(11) 99999-9999');

    document.querySelectorAll('[data-whatsapp-link]').forEach((anchor) => {
      const text = encodeURIComponent(String(anchor.getAttribute('data-whatsapp-message') || 'Olá! Vim pelo site e quero falar com um especialista.'));
      anchor.setAttribute('href', `https://wa.me/${phoneDigits}?text=${text}`);
    });

    document.querySelectorAll('[data-contact-email]').forEach((node) => {
      node.textContent = email;
      if (node.tagName === 'A') node.setAttribute('href', `mailto:${email}`);
    });

    document.querySelectorAll('[data-contact-phone]').forEach((node) => {
      node.textContent = phoneLabel;
      if (node.tagName === 'A') node.setAttribute('href', `tel:${phoneDigits}`);
    });

    document.documentElement.style.setProperty('--brand-primary', String(cfg.brandPrimary || '#1d4ed8'));
    document.documentElement.style.setProperty('--brand-secondary', String(cfg.brandSecondary || '#0f172a'));
  }

  setActiveNav();
  applyContactConfig();
})();
