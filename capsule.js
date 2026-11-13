/* Flynk → Style Capsule animated walkthrough (#capsule). Plays while in view; steps are clickable. */
(function () {
  var root = document.getElementById('fk');
  if (!root) return;
  var screen = root.querySelector('.fk-screen');
  var steps = Array.prototype.slice.call(document.querySelectorAll('#fkSteps li'));
  var finger = document.getElementById('fkFinger');
  var badge = document.getElementById('fkBadge');
  var playBtn = document.getElementById('fkPlay');
  var replayBtn = document.getElementById('fkReplay');
  var el = function (id) { return document.getElementById(id); };
  var DUR = [4600, 4400, 5200, 4000, 5000];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timers = [], scene = 0, playing = false, inView = false, userPaused = false;

  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clear() { timers.forEach(clearTimeout); timers = []; }

  function setBadge(n, bump) {
    badge.textContent = n;
    badge.classList.toggle('on', n > 0);
    if (bump) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
  }
  function moveFinger(target) {
    if (!target) return;
    var s = screen.getBoundingClientRect(), r = target.getBoundingClientRect();
    finger.style.left = (r.left - s.left + r.width * 0.62) + 'px';
    finger.style.top = (r.top - s.top + r.height * 0.55) + 'px';
    finger.classList.add('show');
  }
  function tap(target, after) {
    finger.classList.remove('tap'); void finger.offsetWidth; finger.classList.add('tap');
    if (target) { target.classList.remove('press'); void target.offsetWidth; target.classList.add('press'); }
    if (after) after();
  }
  function resetButtons() {
    var add = el('fkAdd'), cap = el('fkCap'), place = el('fkPlace');
    add.textContent = 'Add to bag'; add.classList.remove('done');
    cap.textContent = 'Add the full capsule'; cap.classList.remove('done');
    place.textContent = 'Place order'; place.classList.remove('done');
    root.querySelectorAll('.fk-item').forEach(function (it, i) { it.classList.toggle('in-bag', i === 0); });
  }

  function show(i) {
    clear();
    scene = i;
    root.setAttribute('data-scene', String(i));
    steps.forEach(function (li, k) {
      li.classList.toggle('is-on', k === i);
      var bar = li.querySelector('.fk-bar');
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    var reel = root.querySelector('.fk-reelbar i');
    if (reel) { reel.style.animation = 'none'; void reel.offsetWidth; reel.style.animation = ''; }
    finger.classList.remove('show');
    resetButtons();
    setBadge(i <= 1 ? 0 : i === 2 ? 1 : 4);
    if (i === 2) { el('fkAdd').textContent = 'Added ✓'; }
    if (i >= 3) {
      el('fkCap').textContent = 'Capsule added ✓'; el('fkCap').classList.add('done');
      root.querySelectorAll('.fk-item').forEach(function (it) { it.classList.add('in-bag'); });
    }
    if (i === 4) { el('fkPlace').textContent = 'Order placed ✓'; el('fkPlace').classList.add('done'); }
    if (!playing) return;

    if (i === 0) {
      later(1100, function () { moveFinger(el('fkHeart')); });
      later(1800, function () {
        tap(null, function () { el('fkHeart').classList.add('pop'); el('fkLikes').textContent = '2.5k'; });
      });
      later(2900, function () { el('fkHeart').classList.remove('pop'); moveFinger(el('fkTagOne')); });
      later(3800, function () { tap(el('fkTagOne')); });
    } else if (i === 1) {
      later(2200, function () { moveFinger(el('fkAdd')); });
      later(2950, function () { tap(el('fkAdd'), function () { el('fkAdd').textContent = 'Added ✓'; el('fkAdd').classList.add('done'); setBadge(1, true); }); });
    } else if (i === 2) {
      later(2500, function () { moveFinger(el('fkCap')); });
      later(3250, function () {
        tap(el('fkCap'), function () {
          el('fkCap').textContent = 'Capsule added ✓'; el('fkCap').classList.add('done');
          root.querySelectorAll('.fk-item').forEach(function (it) { it.classList.add('in-bag'); });
          setBadge(4, true);
        });
      });
    } else if (i === 3) {
      later(1700, function () { moveFinger(el('fkPlace')); });
      later(2450, function () { tap(el('fkPlace'), function () { el('fkPlace').textContent = 'Order placed ✓'; el('fkPlace').classList.add('done'); }); });
    }
    later(DUR[i], function () { show((i + 1) % DUR.length); });
  }

  function setPlaying(on) {
    playing = on;
    root.classList.toggle('is-playing', on);
    playBtn.textContent = on ? '❚❚ Pause' : '▶ Play';
    show(scene);
  }

  steps.forEach(function (li, k) {
    li.querySelector('button').addEventListener('click', function () { show(k); if (playing) return; });
  });
  playBtn.addEventListener('click', function () { userPaused = playing; setPlaying(!playing); });
  replayBtn.addEventListener('click', function () { userPaused = false; scene = 0; setPlaying(true); });

  if (reduce) { playing = false; playBtn.textContent = '▶ Play'; show(0); }
  else if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        inView = e.isIntersecting;
        if (inView && !playing && !userPaused) setPlaying(true);
        else if (!inView && playing) { playing = false; root.classList.remove('is-playing'); clear(); playBtn.textContent = '▶ Play'; }
      });
    }, { threshold: 0.35 }).observe(root);
  } else { setPlaying(true); }

  // basket bars fill when the cards scroll into view
  var why = document.getElementById('fkWhy');
  if (why && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es, o) {
      es.forEach(function (e) { if (e.isIntersecting) { why.classList.add('in'); o.disconnect(); } });
    }, { threshold: 0.3 }).observe(why);
  } else if (why) { why.classList.add('in'); }
})();
