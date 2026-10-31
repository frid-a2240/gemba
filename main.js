'use strict';

const CONTACT_EMAIL = 'roberto.silva@genbainstitution.com';

// ─── Menú móvil ───────────────────────────────────────────────────
const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('nav');

if (toggle && nav) {
  const setMenu = open => {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('nav-open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 1001px)').addEventListener('change', e => { if (e.matches) setMenu(false); });
}

// ─── Carga anticipada de páginas internas ────────────────────────
// Al pasar el mouse (o tocar) un enlace, el navegador prepara la página
// destino para que el cambio de página sea instantáneo.
if (location.protocol.startsWith('http')) {
  if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
    const rules = document.createElement('script');
    rules.type = 'speculationrules';
    // prefetch (solo el HTML, muy ligero) al acercarse a un enlace;
    // prerender (página completa) solo al presionarlo, para no cargar el celular
    rules.textContent = JSON.stringify({
      prefetch: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }],
      prerender: [{ where: { href_matches: '/*' }, eagerness: 'conservative' }],
    });
    document.head.append(rules);
  } else {
    const done = new Set();
    const prefetch = e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.origin !== location.origin || a.hash && a.pathname === location.pathname) return;
      if (done.has(a.pathname)) return;
      done.add(a.pathname);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = a.pathname;
      document.head.append(link);
    };
    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('touchstart', prefetch, { passive: true });
  }
}

// ─── Aparición al hacer scroll ───────────────────────────────────
// Solo se ocultan los elementos que aún no están en pantalla, así nada
// parpadea al cargar y sin JavaScript todo se ve normal.
const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (motionOK) {
  const belowFold = el => el.getBoundingClientRect().top > window.innerHeight * 0.95;
  let pending = [];

  document.querySelectorAll([
    '.section-head', '.statement > *', '.col', '.step', '.index-list a',
    '.detail-intro', '.detail-body', '.value', '.cta-band .container > *',
    '.form', '.contact-card', '.notfound .container',
  ].join(',')).forEach(el => {
    if (!belowFold(el)) return;
    // Escalonar elementos hermanos (columnas, pasos, filas)
    const i = [...el.parentElement.children].indexOf(el);
    el.style.transitionDelay = `${Math.min(i, 4) * 70}ms`;
    el.classList.add('reveal');
    pending.push(el);
  });

  document.querySelectorAll('.columns, .step').forEach(el => {
    if (!belowFold(el)) return;
    el.classList.add('reveal-line');
    pending.push(el);
  });

  let ticking = false;
  const check = () => {
    ticking = false;
    pending = pending.filter(el => {
      if (belowFold(el)) return true;
      el.classList.add('in');
      setTimeout(() => { el.style.transitionDelay = ''; }, 1000);
      return false;
    });
    if (!pending.length) {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(check); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', check);
  check();
}

// ─── Sub-navegación: marca la sección visible ────────────────────
const subLinks = [...document.querySelectorAll('.subnav a[href^="#"]')];

if (subLinks.length) {
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      subLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-35% 0px -60% 0px' });

  subLinks.forEach(l => {
    const section = document.getElementById(l.getAttribute('href').slice(1));
    if (section) spy.observe(section);
  });
}

// ─── Formulario de contacto ──────────────────────────────────────
// Sitio estático: no hay servidor que reciba datos. El formulario arma
// un correo en el cliente de correo del usuario con la información.
const form = document.getElementById('contact-form');

if (form) {
  const status = form.querySelector('.form-status');

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (form.elements.website.value) return; // honeypot anti-bots
    if (!form.reportValidity()) return;

    const field = name => form.elements[name].value.trim();
    const subject = `Solicitud de información — ${field('empresa')}`;
    const body = [
      `Nombre: ${field('nombre')}`,
      `Organización: ${field('empresa')}`,
      `Correo: ${field('correo')}`,
      `Teléfono: ${field('telefono') || '—'}`,
      `Servicio de interés: ${field('servicio')}`,
      '',
      field('mensaje'),
    ].join('\n');

    window.location.href =
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Se abrió su aplicación de correo con la solicitud lista para enviarse. Gracias por su interés.';
  });
}
