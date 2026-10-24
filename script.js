document.getElementById('year').textContent = new Date().getFullYear();

const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

const revealEls = document.querySelectorAll('[data-reveal]');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
revealEls.forEach(el => io.observe(el));

const navToggle = document.getElementById('navToggle');
if (navToggle) {
  navToggle.addEventListener('click', () => nav.classList.toggle('open'));
  document.querySelectorAll('#navLinks a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const whenVisible = (el, onChange) => new IntersectionObserver(([e]) => onChange(e.isIntersecting), { threshold: 0.3 }).observe(el);

// Customer journey: auto-advances through the six steps while on screen; tap a step to jump to it.
const fj = document.getElementById('fj');
if (fj) {
  const steps = [...fj.querySelectorAll('.fj-steps li')];
  const screens = [...fj.querySelectorAll('.fj-screen')];
  const chipA = document.getElementById('fjChipA');
  const chipB = document.getElementById('fjChipB');
  const DUR = 4200;
  let cur = 0, timer = null, visible = false;

  const show = (i) => {
    cur = i;
    steps.forEach((li, k) => { li.classList.remove('is-on'); if (k === i) { void li.offsetWidth; li.classList.add('is-on'); } });
    screens.forEach((s, k) => s.classList.toggle('is-on', k === i));
    [chipA, chipB].forEach(c => c.classList.add('swap'));
    setTimeout(() => {
      chipA.textContent = steps[i].dataset.chip;
      chipB.textContent = steps[i].dataset.engine;
      [chipA, chipB].forEach(c => c.classList.remove('swap'));
    }, 250);
    schedule();
  };
  const personaBtns = [...fj.querySelectorAll('.fj-persona button')];
  const setPersona = (p) => {
    fj.dataset.p = p;
    personaBtns.forEach(b => b.classList.toggle('is-on', b.dataset.p === p));
  };
  personaBtns.forEach(b => b.addEventListener('click', () => { setPersona(b.dataset.p); show(0); }));
  // After the last step, switch shopper (womenswear <-> menswear) and start again.
  const next = () => {
    if (cur === steps.length - 1) setPersona(fj.dataset.p === 'w' ? 'm' : 'w');
    show((cur + 1) % steps.length);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (visible && !reduceMotion) timer = setTimeout(next, DUR);
  };
  fj.style.setProperty('--fj-dur', DUR + 'ms');
  if (reduceMotion) fj.classList.add('paused');
  steps.forEach((li, k) => li.querySelector('button').addEventListener('click', () => show(k)));
  whenVisible(fj, (v) => { visible = v; fj.classList.toggle('paused', !v || reduceMotion); schedule(); });
}

// Why invest: count the market numbers up when they scroll into view.
document.querySelectorAll('[data-count]').forEach(el => {
  const end = +el.dataset.count;
  if (reduceMotion) { el.textContent = end; return; }
  const ob = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    ob.disconnect();
    const t0 = performance.now(), dur = 1600;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.6 });
  ob.observe(el);
});

// Flywheel: a dot runs the loop; each turn is faster and the illustrative cost-per-order index drops.
const wheel = document.getElementById('fwWheel');
if (wheel) {
  const nodes = [...wheel.querySelectorAll('.fw-node')];
  const dot = document.getElementById('fwDot');
  const trail = document.getElementById('fwTrail');
  const idxEl = document.getElementById('fwIndex');
  const bar = document.getElementById('fwMeterBar');
  const turnEl = document.getElementById('fwTurn');
  const R = 230, C = 2 * Math.PI * R, BASE = 7200;
  const INDEX = [100, 72, 52, 38];   // illustrative targets, not results
  let turn = 0, p = 0, last = 0, raf = null;

  const setTurn = (t) => {
    turn = t;
    idxEl.textContent = INDEX[t];
    bar.style.width = INDEX[t] + '%';
    turnEl.textContent = t + 1;
  };
  const draw = () => {
    const a = (p * 360 - 90) * Math.PI / 180;
    dot.setAttribute('cx', 300 + R * Math.cos(a));
    dot.setAttribute('cy', 300 + R * Math.sin(a));
    trail.style.strokeDashoffset = C * (1 - p);
    const on = Math.round(p * 6) % 6;
    nodes.forEach((n, k) => n.classList.toggle('is-on', k === on));
  };
  const tick = (now) => {
    const dt = last ? now - last : 0;
    last = now;
    p += dt / (BASE / (1 + 0.35 * turn));
    if (p >= 1) { p = 0; setTurn((turn + 1) % INDEX.length); }
    draw();
    raf = requestAnimationFrame(tick);
  };
  setTurn(0);
  if (reduceMotion) {
    p = 0.999; draw(); nodes.forEach(n => n.classList.remove('is-on'));
    idxEl.textContent = '100 → 38'; bar.style.width = '38%'; turnEl.textContent = '1 → 4';
  } else {
    draw();
    whenVisible(wheel, (v) => {
      cancelAnimationFrame(raf); last = 0;
      if (v) raf = requestAnimationFrame(tick);
    });
  }
}
