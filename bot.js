/* Flynker AI host: an animated avatar that tours the site out loud, then takes investors' questions by voice.
   Talks to the Apps Script relay set in data-endpoint (see bot/SETUP.md). */
(function () {
  const me = document.currentScript;
  const ENDPOINT = (me && me.dataset.endpoint) || '';
  if (!ENDPOINT) return;                       // stays hidden until the relay is deployed

  const CALL = 'https://calendly.com/tharunkarthikeya98/30min';
  const LABELS = { top: 'Welcome', shift: 'The shift', problem: 'The problem', engines: 'Our two engines', flywheel: 'The flywheel',
    product: 'The product', ecosystem: 'Four apps', creators: 'Creators & designers', moat: 'Why we win', model: 'Go-to-market & revenue',
    roadmap: 'Built so far', ask: 'The ask', team: 'The team', faq: 'Your questions' };
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  const store = {
    get(k, s) { try { return JSON.parse((s || sessionStorage).getItem(k)); } catch (e) { return null; } },
    set(k, v, s) { try { (s || sessionStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  let visitor = store.get('fb_visitor', localStorage);
  if (!visitor) { visitor = 'v' + Math.random().toString(36).slice(2, 12); store.set('fb_visitor', visitor, localStorage); }
  let history = store.get('fb_history') || [];

  let mode = 'tour';            // tour | qa
  let state = 'idle';           // idle | thinking | speaking | listening | paused
  let step = 0, total = 14, tourDone = store.get('fb_tour_done') === true;
  let busy = false, runId = 0;
  const steps = {};             // step index -> promise of relay data (prefetch)

  const icon = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12v12h2V6h-2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    replay: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>'
  };

  // Host avatar: a short AI-generated clip of Tharun talking (made with Gemini), looped while the voice plays.
  const asset = function (f) { return new URL('assets/team/' + f, me.src).href; };
  const IDLE = asset('tharun-idle.jpg'), TALK = asset('tharun-talk.mp4');
  const AVATAR =
    '<div class="fb-av"><img class="fb-av-still" src="' + IDLE + '" alt="">' +
      '<video class="fb-av-talk" src="' + TALK + '" poster="' + IDLE + '" muted loop playsinline preload="auto"></video></div>';

  const root = document.createElement('div');
  root.className = 'fb-root';
  root.innerHTML =
    '<button class="fb-launch" type="button" aria-label="Start a guided tour with Flynker AI">' +
      '<span class="fb-launch-av"><img src="' + IDLE + '" alt=""></span><span class="fb-launch-txt"><b>Meet Flynker AI</b><small>3-min tour with AI Tharun</small></span></button>' +
    '<section class="fb-dock" role="dialog" aria-label="Flynker AI guided tour">' +
      '<header class="fb-dock-head"><span><b>Flynker AI</b> · AI avatar of founder Tharun Bandla</span>' +
        '<button class="fb-x" type="button" aria-label="Close">' + icon.close + '</button></header>' +
      '<div class="fb-dock-body">' +
        '<div class="fb-avatar">' + AVATAR + '<span class="fb-badge"></span></div>' +
        '<div class="fb-side">' +
          '<p class="fb-where"></p>' +
          '<div class="fb-progress"><i></i></div>' +
          '<p class="fb-caption" aria-live="polite"></p>' +
        '</div>' +
      '</div>' +
      '<div class="fb-ctrl">' +
        '<button class="fb-btn fb-pp" type="button"></button>' +
        '<button class="fb-btn fb-next" type="button">' + icon.next + '<span>Next</span></button>' +
        '<button class="fb-btn fb-primary fb-ask" type="button"></button>' +
        '<button class="fb-btn fb-replay" type="button">' + icon.replay + '<span>Replay tour</span></button>' +
      '</div>' +
      '<form class="fb-type"><input type="text" maxlength="600" placeholder="Or type a question…" aria-label="Type a question">' +
        '<button type="submit" aria-label="Send">' + icon.send + '</button></form>' +
      '<p class="fb-foot">AI answers can be wrong; the founders have the final word. Questions are saved to help us improve. <a href="' + CALL + '" target="_blank" rel="noopener">Book a founder call</a></p>' +
    '</section>';
  document.body.appendChild(root);

  const $ = function (s) { return root.querySelector(s); };
  const dock = $('.fb-dock'), caption = $('.fb-caption'), where = $('.fb-where'), bar = $('.fb-progress i');
  const ppBtn = $('.fb-pp'), nextBtn = $('.fb-next'), askBtn = $('.fb-ask'), replayBtn = $('.fb-replay');
  const typeForm = $('.fb-type'), typeInput = typeForm.querySelector('input');
  const av = $('.fb-avatar .fb-av'), talk = av.querySelector('video');

  /* ---------- audio out (Gemini voice, browser voice as fallback) ---------- */
  const player = new Audio();
  let ctx = null, analyser = null, levels = null, audioUrl = null, browserTalking = false, finishFn = null;
  function unlockAudio() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        levels = new Uint8Array(analyser.fftSize);
        ctx.createMediaElementSource(player).connect(analyser);
        analyser.connect(ctx.destination);
      } catch (e) { ctx = null; analyser = null; }
      player.src = SILENT; player.play().catch(function () {});   // lets later answers play on iOS
      if ('speechSynthesis' in window) speechSynthesis.getVoices();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function pcmToWav(b64, rate) {
    const bin = atob(b64), n = bin.length, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = function (o, s) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n, true);
    const bytes = new Uint8Array(buf, 44);
    for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: 'audio/wav' });
  }
  function bestVoice() {
    const vs = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
    const pick = function (re, lang) { return vs.find(function (x) { return re.test(x.name) && lang.test(x.lang); }); };
    return pick(/natural|online|google/i, /en-IN/i) || pick(/./, /en-IN/i) || pick(/natural|online|google/i, /^en/i) || pick(/./, /^en/i);
  }
  function stopSpeaking() {
    finishFn = null; player.onended = null; player.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    browserTalking = false;
  }
  function speak(text, audio, done) {
    stopSpeaking();
    finishFn = done || null;
    const finish = function () { browserTalking = false; const f = finishFn; finishFn = null; if (f) f(); };
    if (audio && audio.data) {
      try {
        const m = /rate=(\d+)/.exec(audio.mime || '');
        const blob = /wav/i.test(audio.mime || '') ?
          new Blob([Uint8Array.from(atob(audio.data), function (c) { return c.charCodeAt(0); })], { type: 'audio/wav' }) :
          pcmToWav(audio.data, m ? Number(m[1]) : 24000);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioUrl = URL.createObjectURL(blob);
        player.src = audioUrl;
        player.onended = finish;
        player.play().catch(function () { browserSpeak(text, finish); });
        return;
      } catch (e) { /* fall back to the browser voice */ }
    }
    browserSpeak(text, finish);
  }
  function browserSpeak(text, done) {
    if (!('speechSynthesis' in window)) { setTimeout(done, Math.min(9000, text.length * 55)); return; }
    const u = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, 'the link on the page'));
    const v = bestVoice(); if (v) u.voice = v;
    u.onstart = function () { browserTalking = true; };
    u.onend = u.onerror = done;
    browserTalking = true;
    speechSynthesis.speak(u);
  }
  function pauseSpeaking() { player.pause(); if ('speechSynthesis' in window) speechSynthesis.pause(); }
  function resumeSpeaking() {
    if (player.src && !player.ended && player.currentTime > 0) player.play().catch(function () {});
    if ('speechSynthesis' in window) speechSynthesis.resume();
  }

  /* ---------- avatar animation: the talking clip plays while the voice is audible ---------- */
  let quietSince = 0;
  function frame(t) {
    let talking = false;
    if (state === 'speaking') {
      if (analyser && !player.paused && player.src.indexOf('blob:') === 0) {
        analyser.getByteTimeDomainData(levels);
        let sum = 0;
        for (let i = 0; i < levels.length; i++) { const x = (levels[i] - 128) / 128; sum += x * x; }
        if (Math.sqrt(sum / levels.length) > 0.02) quietSince = 0; else if (!quietSince) quietSince = t;
        talking = !quietSince || t - quietSince < 350;          // stop between sentences, not between words
      } else {
        talking = browserTalking;
      }
    }
    if (talking && talk.paused) { talk.play().catch(function () {}); av.classList.add('fb-talking'); }
    else if (!talking && !talk.paused) { talk.pause(); av.classList.remove('fb-talking'); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- state + controls ---------- */
  function setState(s) {
    state = s;
    dock.dataset.state = s;
    dock.dataset.mode = mode;
    const inTour = mode === 'tour';
    ppBtn.hidden = !inTour;
    nextBtn.hidden = !inTour;
    replayBtn.hidden = inTour || !tourDone;
    ppBtn.innerHTML = s === 'paused' ? icon.play + '<span>Resume</span>' : icon.pause + '<span>Pause</span>';
    askBtn.innerHTML = s === 'listening' ? icon.stop + '<span>Done</span>' :
      (inTour ? icon.mic + '<span>Ask a question</span>' : (step < total - 1 && !tourDone ? icon.mic + '<span>Ask</span>' : icon.mic + '<span>Tap to talk</span>'));
    if (!inTour && !tourDone && step < total - 1) { replayBtn.hidden = false; replayBtn.innerHTML = icon.play + '<span>Resume tour</span>'; }
    else replayBtn.innerHTML = icon.replay + '<span>Replay tour</span>';
    $('.fb-badge').textContent = { speaking: 'Speaking', listening: 'Listening…', thinking: 'Thinking…', paused: 'Paused', idle: '' }[s] || '';
  }
  function setWhere(text, pct) { where.textContent = text; bar.style.width = (pct * 100).toFixed(1) + '%'; }

  /* ---------- page: scroll + spotlight ---------- */
  function goTo(id) {
    document.querySelectorAll('.fb-spot').forEach(function (el) { el.classList.remove('fb-spot'); });
    const el = document.getElementById(id);
    if (!el) return;
    const nav = document.getElementById('nav');
    const top = id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - (nav ? nav.offsetHeight : 0) + 2;
    window.scrollTo({ top: top, behavior: 'smooth' });
    if (id !== 'top') el.classList.add('fb-spot');
  }

  /* ---------- relay ---------- */
  async function post(payload) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // simple request: no CORS preflight
      body: JSON.stringify(payload)
    });
    return res.json();
  }
  function getStep(i) {
    if (!steps[i]) steps[i] = post({ tourStep: i, visitor: visitor }).catch(function () { delete steps[i]; return null; });
    return steps[i];
  }

  /* ---------- the tour ---------- */
  async function playStep(i) {
    const id = ++runId;
    mode = 'tour'; step = i;
    stopListening(); stopSpeaking();
    setState('thinking');
    const data = await getStep(i);
    if (id !== runId) return;                          // the investor skipped or asked something meanwhile
    if (!data || !data.reply) { caption.textContent = 'I couldn\'t load the tour just now. You can still ask me anything.'; mode = 'qa'; setState('idle'); return; }
    total = data.total || total;
    if (i + 1 < total) getStep(i + 1);                 // prefetch so the next section starts instantly
    if (i + 2 < total) getStep(i + 2);
    goTo(data.section);
    setWhere((i + 1) + ' of ' + total + ' · ' + (LABELS[data.section] || ''), (i + 1) / total);
    caption.textContent = data.reply;
    setState('speaking');
    speak(data.reply, data.audio, function () {
      if (id !== runId) return;
      if (i + 1 < total) { setTimeout(function () { if (id === runId && state === 'speaking') playStep(i + 1); }, 450); }
      else { tourDone = true; store.set('fb_tour_done', true); mode = 'qa'; listen(); }
    });
  }

  /* ---------- questions ---------- */
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function listen() {
    runId++;
    stopSpeaking();
    if (mode === 'tour') mode = 'qa';
    if (!Rec) { setState('idle'); caption.textContent = 'Voice questions aren\'t supported in this browser. Type your question below.'; typeInput.focus(); return; }
    stopListening();
    rec = new Rec();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    let heard = '', sent = false, blocked = false;
    rec.onresult = function (e) {
      heard = Array.from(e.results).map(function (r) { return r[0].transcript; }).join('');
      caption.textContent = '“' + heard + '”';
      if (e.results[e.results.length - 1].isFinal && heard.trim()) { sent = true; try { rec.stop(); } catch (x) {} ask(heard); }
    };
    rec.onerror = function (e) { blocked = e.error === 'not-allowed' || e.error === 'service-not-allowed'; };
    rec.onend = function () {
      rec = null;
      if (sent || state !== 'listening') return;
      setState('idle');
      caption.textContent = blocked ? 'Your microphone is blocked. Allow it in the browser, or type your question below.' :
        'Any questions? Tap the button and ask me out loud, or type below.';
    };
    setWhere('Your questions', 1);
    setState('listening');
    try { rec.start(); } catch (e) { setState('idle'); }
  }
  function stopListening() { if (rec) { const r = rec; rec = null; r.onend = null; try { r.abort(); } catch (e) {} } }

  async function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    const id = ++runId;
    mode = 'qa';
    stopListening(); stopSpeaking();
    caption.textContent = '“' + text + '”';
    setWhere('Your questions', 1);
    setState('thinking');
    let data;
    try { data = await post({ message: text, history: history.slice(-16), visitor: visitor, mode: 'voice' }); } catch (e) { data = null; }
    busy = false;
    if (id !== runId) return;
    const reply = (data && data.reply) || 'I\'m having trouble connecting. Please try again, or book a call with the founders: ' + CALL;
    history.push({ role: 'user', text: text }, { role: 'model', text: reply });
    history = history.slice(-20);
    store.set('fb_history', history);
    caption.textContent = reply;
    setState('speaking');
    speak(reply, data && data.audio, function () { if (id === runId) listen(); });
  }

  /* ---------- open / close ---------- */
  function open() {
    unlockAudio();
    document.documentElement.classList.add('fb-open');
    const hello = root.querySelector('.fb-hello'); if (hello) hello.remove();
    store.set('fb_hello_seen', true);
    if (tourDone) {
      mode = 'qa';
      setWhere('Your questions', 1);
      caption.textContent = 'Welcome back! Ask me anything about Flynker, or replay the tour.';
      setState('idle');
    } else {
      playStep(step);
    }
  }
  function close() {
    runId++;
    document.documentElement.classList.remove('fb-open');
    stopListening(); stopSpeaking();
    document.querySelectorAll('.fb-spot').forEach(function (el) { el.classList.remove('fb-spot'); });
    setState('idle');
  }

  $('.fb-launch').addEventListener('click', open);
  $('.fb-x').addEventListener('click', close);
  ppBtn.addEventListener('click', function () {
    unlockAudio();
    if (state === 'paused') { setState('speaking'); resumeSpeaking(); }
    else if (state === 'speaking') { pauseSpeaking(); setState('paused'); }
  });
  nextBtn.addEventListener('click', function () { unlockAudio(); if (step + 1 < total) playStep(step + 1); });
  askBtn.addEventListener('click', function () {
    unlockAudio();
    if (state === 'listening') { if (rec) rec.stop(); return; }
    caption.textContent = 'I\'m listening. Go ahead and ask.';
    listen();
  });
  replayBtn.addEventListener('click', function () {
    unlockAudio();
    if (!tourDone && step < total - 1) playStep(step + 1);
    else { tourDone = false; store.set('fb_tour_done', false); playStep(0); }
  });
  typeForm.addEventListener('submit', function (e) { e.preventDefault(); unlockAudio(); const q = typeInput.value; typeInput.value = ''; ask(q); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.documentElement.classList.contains('fb-open')) close();
  });
  setState('idle');

  // Greeting bubble, once per visit, after the investor has had a moment on the page
  if (!store.get('fb_hello_seen')) {
    setTimeout(function () {
      if (document.documentElement.classList.contains('fb-open')) return;
      const b = document.createElement('div');
      b.className = 'fb-hello';
      b.innerHTML = '<b>Hi, I\'m Flynker AI.</b> Tap here and I\'ll walk you through Flynker in 3 minutes, then answer your questions.<button type="button" aria-label="Dismiss">×</button>';
      b.addEventListener('click', function (e) {
        if (e.target.tagName === 'BUTTON') { b.remove(); store.set('fb_hello_seen', true); } else { open(); }
      });
      root.appendChild(b);
    }, 5000);
  }
})();
