/* 뽀모도로 타이머 — 화면 3개(첫 화면 · 타이머 · 끝난 화면).
   - 남은 시간은 '끝나는 시각'(Date.now 기준)으로 계산 → 탭이 뒤에 있어도 시간이 밀리지 않는다.
   - 알림음은 시작할 때 오디오 시계에 미리 예약 → 다른 탭을 보고 있어도 제때 울린다.
   - 설정(분·초·알림음·쉬는 시간)과 진행 중인 타이머는 이 기기(localStorage)에 보관 → 새로고침해도 이어진다. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = { set: 'pomo.v1.settings', ses: 'pomo.v1.session', day: 'pomo.v1.today' };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 안 돼도 타이머는 돈다 */ } };
  const drop = (k) => { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } };
  const clampInt = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };

  const el = {};
  ['announce', 'soundBtn', 'fsBtn', 'scrSetup', 'scrRun', 'scrDone', 'setupH',
    'minDial', 'kWedge', 'kHand', 'kKnob', 'secDial', 'sWedge', 'sHand', 'sKnob', 'readout',
    'setupForm', 'minSel', 'secSel', 'endLine', 'endText', 'timeErr', 'taskInp',
    'runTask', 'runStatus', 'runStatusText', 'digits', 'runDisc', 'runWedge', 'runHand', 'pauseBadge',
    'runCtl', 'pauseBtn', 'pauseLabel', 'stopBtn', 'confirmRow', 'confirmQ', 'keepBtn', 'quitBtn',
    'doneHead', 'doneTag', 'doneInner', 'doneH', 'doneSub', 'streak', 'streakText', 'restRow', 'restSel',
    'restBtn', 'restLabel', 'againBtn', 'againLabel', 'homeBtn', 'muteBtn'].forEach((id) => { el[id] = $(id); });
  const digitEls = Array.from(el.digits.children);
  el.setupH.setAttribute('tabindex', '-1');

  const saved = load(KEY.set) || {};
  const S = {
    screen: 'setup', mode: 'focus',
    min: clampInt(saved.min, 0, 60, 25), sec: clampInt(saved.sec, 0, 59, 0),
    sound: saved.sound !== false, restMin: clampInt(saved.restMin, 1, 30, 5),
    task: '', totalMs: 0, endAt: 0, remainMs: 0, paused: false, confirm: false, ringing: false, today: 0,
  };
  const saveSettings = () => save(KEY.set, { min: S.min, sec: S.sec, sound: S.sound, restMin: S.restMin });
  const focusSec = () => S.min * 60 + S.sec;
  function label(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m && s) return m + '분 ' + s + '초';
    if (m) return m + '분';
    return s + '초';
  }
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  let annT = 0;
  function announce(msg) {
    clearTimeout(annT);
    el.announce.textContent = '';
    if (msg) annT = setTimeout(() => { el.announce.textContent = msg; }, 60);
  }

  /* ── 알림음 ── */
  let ac = null;
  let chimes = [];
  let ringArmed = false;
  let ringT = 0;
  function audio(after) {
    try {
      if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
      if (!ac) return null;
      if (ac.state === 'running') { if (after) after(); } else {
        const p = ac.resume();
        if (p && p.then) p.then(() => { if (after) after(); }).catch(() => {});
      }
    } catch (e) { /* 소리 없이도 동작 */ }
    return ac;
  }
  function chimeAt(t) {
    [[784, 0], [988, 0.22], [1175, 0.44]].forEach(([f, d]) => {
      try {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.22, t + d + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.3);
        o.connect(g);
        g.connect(ac.destination);
        o.start(t + d);
        o.stop(t + d + 1.4);
        chimes.push({ o, g });
      } catch (e) { /* 무시 */ }
    });
  }
  function cancelChimes() {
    chimes.forEach(({ o, g }) => {
      try { o.stop(); } catch (e) { /* 이미 끝남 */ }
      try { g.disconnect(); } catch (e) { /* 이미 끊김 */ }
    });
    chimes = [];
    ringArmed = false;
  }
  // 끝나는 순간(ms 뒤)에 맞춰 3번(4초 간격) 예약
  function scheduleRing(ms) {
    cancelChimes();
    if (!S.sound || !ac || ac.state !== 'running') return;
    const t0 = ac.currentTime + Math.max(0, ms) / 1000 + 0.05;
    chimeAt(t0); chimeAt(t0 + 4); chimeAt(t0 + 8);
    ringArmed = true;
  }
  const armRing = () => { if (S.screen === 'run' && !S.paused) scheduleRing(remaining()); };
  function stopRinging() {
    cancelChimes();
    clearTimeout(ringT);
    S.ringing = false;
  }

  /* ── 화면 꺼짐 막기(TV·전자칠판) ── */
  let wake = null;
  async function wakeOn() {
    try {
      if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (e) { wake = null; }
  }
  function wakeOff() { try { if (wake) wake.release(); } catch (e) { /* 무시 */ } wake = null; }

  /* ── 그림 계산 ── */
  function pt(cx, cy, r, a) {
    const rad = a * Math.PI / 180;
    return [(cx + r * Math.sin(rad)).toFixed(2), (cy - r * Math.cos(rad)).toFixed(2)];
  }
  // 12시에서 시계 방향으로 a도까지 칠한 부채꼴(첫 화면 시계)
  function arc(cx, cy, r, a) {
    if (a >= 359.9) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
    if (a <= 0.1) return '';
    const p = pt(cx, cy, r, a);
    return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${a > 180 ? 1 : 0} 1 ${p[0]} ${p[1]} Z`;
  }
  // 남은 비율 f 만큼 — 12시에서 바늘 자리까지(타이머 원판, 바늘이 반시계 방향으로 돌며 줄어듦)
  function leftWedge(f) {
    if (f >= 0.9995) return 'M 166 34 A 132 132 0 1 1 166 298 A 132 132 0 1 1 166 34 Z';
    if (f <= 0.0005) return '';
    const p = pt(166, 166, 132, f * 360);
    return `M 166 166 L 166 34 A 132 132 0 ${f > 0.5 ? 1 : 0} 1 ${p[0]} ${p[1]} Z`;
  }

  /* ── 타이머 ── */
  let finT = 0;
  let raf = 0;
  const remaining = () => (S.paused ? S.remainMs : Math.max(0, S.endAt - Date.now()));
  const saveSession = () => save(KEY.ses, { mode: S.mode, totalMs: S.totalMs, endAt: S.endAt, remainMs: S.remainMs, paused: S.paused, task: S.task });
  function armFinish() {
    clearTimeout(finT);
    if (S.screen === 'run' && !S.paused) finT = setTimeout(checkFinish, Math.max(0, S.endAt - Date.now()) + 40);
  }
  function checkFinish() {
    if (S.screen !== 'run' || S.paused) return;
    if (remaining() <= 0) finish(false); else armFinish();
  }
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (S.screen !== 'run' || S.paused) return;
      if (remaining() <= 0) { finish(false); return; }
      renderRun(false);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function begin(mode, ms) {
    S.mode = mode; S.totalMs = ms; S.remainMs = ms; S.endAt = Date.now() + ms; S.paused = false; S.confirm = false;
    stopRinging();
    show('run');
    armFinish();
    audio(armRing);
    saveSession();
    announce(label(Math.round(ms / 1000)) + (mode === 'break' ? ' 쉬는 시간을 시작했어요' : ' 집중을 시작했어요'));
    loop();
  }
  function pause() {
    if (S.paused) return;
    S.remainMs = remaining(); S.paused = true;
    clearTimeout(finT); cancelAnimationFrame(raf); cancelChimes(); saveSession();
    renderRun(true);
    announce('잠깐 멈췄어요');
  }
  function resume() {
    if (!S.paused) return;
    S.endAt = Date.now() + S.remainMs; S.paused = false;
    armFinish(); audio(armRing); saveSession();
    renderRun(true);
    announce('다시 시작했어요');
    loop();
  }
  // silent: 다른 기기·새로고침 뒤 이미 끝나 있던 타이머 — 갑자기 울리지 않게
  function finish(silent) {
    clearTimeout(finT); cancelAnimationFrame(raf);
    const focusDone = S.mode !== 'break';
    S.paused = false; S.confirm = false; S.remainMs = 0;
    drop(KEY.ses);
    if (focusDone) {
      const t = load(KEY.day);
      S.today = (t && t.date === todayKey() ? (t.count || 0) : 0) + 1;
      save(KEY.day, { date: todayKey(), count: S.today });
    }
    if (S.sound && !silent) {
      if (!ringArmed) audio(() => scheduleRing(0));
      S.ringing = true;
      clearTimeout(ringT);
      ringT = setTimeout(() => {
        S.ringing = false;
        const hadFocus = document.activeElement === el.muteBtn;
        renderDone();
        if (hadFocus) el.doneH.focus();
      }, 9800);
    }
    show('done');
    announce(focusDone ? '시간 다 됐어요. ' + (S.task ? S.task + ', ' : '') + label(Math.round(S.totalMs / 1000)) + ' 집중 끝.' : '쉬는 시간 끝. 다시 집중해 볼까요?');
    requestAnimationFrame(() => el.doneH.focus());
  }
  function goHome() {
    clearTimeout(finT); cancelAnimationFrame(raf); stopRinging();
    S.paused = false; S.confirm = false;
    drop(KEY.ses);
    show('setup');
    announce('');
    el.setupH.focus();
  }
  function keepGoing() {
    S.confirm = false;
    if (S.paused) resume(); else renderRun(true);
    el.pauseBtn.focus();
  }

  /* ── 화면 그리기 ── */
  function show(scr) {
    S.screen = scr;
    el.scrSetup.hidden = scr !== 'setup';
    el.scrRun.hidden = scr !== 'run';
    el.scrDone.hidden = scr !== 'done';
    if (scr === 'setup') { wakeOff(); renderSetup(); document.title = '뽀모도로 타이머'; }
    if (scr === 'run') { wakeOn(); renderRun(true); }
    if (scr === 'done') { renderDone(); document.title = (S.mode === 'break' ? '쉬는 시간 끝!' : '시간 다 됐어요!') + ' · 뽀모도로 타이머'; }
  }

  let errOn = false;
  function renderEnd() {
    const tot = focusSec();
    el.endLine.hidden = tot === 0 || errOn;
    if (tot > 0) {
      const at = new Date(Date.now() + tot * 1000).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
      el.endText.textContent = '지금 시작하면 ' + at + '에 끝나요';
    }
  }
  function setErr(on) {
    errOn = on;
    el.timeErr.hidden = !on;
    [el.minSel, el.secSel].forEach((s) => {
      s.setAttribute('aria-invalid', on ? 'true' : 'false');
      if (on) s.setAttribute('aria-describedby', 'timeErr'); else s.removeAttribute('aria-describedby');
    });
    renderEnd();
  }
  function renderSetup() {
    el.minSel.value = String(S.min);
    el.secSel.value = String(S.sec);
    const mA = Math.min(60, S.min) * 6;
    const sA = Math.min(59, S.sec) * 6;
    el.kWedge.setAttribute('d', arc(166, 166, 124, mA));
    const kp = pt(166, 166, 112, mA);
    el.kHand.setAttribute('x2', kp[0]); el.kHand.setAttribute('y2', kp[1]);
    el.kKnob.setAttribute('transform', `translate(${kp[0]} ${kp[1]}) rotate(${mA})`);
    el.kKnob.setAttribute('aria-valuenow', String(S.min));
    el.kKnob.setAttribute('aria-valuetext', S.min + '분');
    el.sWedge.setAttribute('d', arc(110, 116, 66, sA));
    const sp = pt(110, 116, 52, sA);
    el.sHand.setAttribute('x2', sp[0]); el.sHand.setAttribute('y2', sp[1]);
    el.sKnob.setAttribute('transform', `translate(${sp[0]} ${sp[1]}) rotate(${sA})`);
    el.sKnob.setAttribute('aria-valuenow', String(S.sec));
    el.sKnob.setAttribute('aria-valuetext', S.sec + '초');
    const tot = focusSec();
    el.readout.textContent = tot ? label(tot) : '0분';
    renderEnd();
  }
  function setTime(min, sec) {
    S.min = min; S.sec = sec;
    if (errOn) setErr(false);
    saveSettings();
    renderSetup();
  }

  const last = {};
  function renderRun(force) {
    const rem = remaining();
    const frac = S.totalMs > 0 ? Math.min(1, Math.max(0, rem / S.totalMs)) : 0;
    el.runWedge.setAttribute('d', leftWedge(frac));
    const hp = pt(166, 166, 124, frac * 360);
    el.runHand.setAttribute('x2', hp[0]); el.runHand.setAttribute('y2', hp[1]);
    const secs = Math.ceil(rem / 1000);
    const soon = rem <= Math.min(60000, S.totalMs * 0.2);
    if (force || secs !== last.secs) {
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      digitEls[0].textContent = mm[0]; digitEls[1].textContent = mm[1];
      digitEls[3].textContent = ss[0]; digitEls[4].textContent = ss[1];
      el.digits.setAttribute('aria-label', '남은 시간 ' + Number(mm) + '분 ' + Number(ss) + '초');
      el.runDisc.setAttribute('aria-label', '남은 시간 ' + Math.round(frac * 100) + '%');
      document.title = (S.paused ? '멈춤 ' : '') + mm + ':' + ss + ' · ' + (S.mode === 'break' ? '쉬는 중' : '집중');
      last.secs = secs;
    }
    if (force || soon !== last.soon || S.paused !== last.paused || S.mode !== last.mode || S.confirm !== last.confirm) {
      let text = S.mode === 'break' ? '쉬는 중' : '집중하는 중';
      let cls = S.mode === 'break' ? 'st st-rest' : 'st st-live';
      if (soon) { text = '곧 끝나요'; cls = 'st st-soon'; }
      if (S.paused) { text = '잠깐 멈춤'; cls = 'st st-pause'; }
      el.runStatus.className = cls;
      el.runStatusText.textContent = text;
      el.runWedge.setAttribute('fill', soon ? 'url(#gSoon)' : (S.mode === 'break' ? 'url(#gRest)' : 'url(#gFocus)'));
      el.digits.classList.toggle('is-paused', S.paused);
      el.pauseBadge.style.display = S.paused ? '' : 'none';
      el.pauseBtn.classList.toggle('is-paused', S.paused);
      el.pauseLabel.textContent = S.paused ? '계속하기' : '멈추기';
      el.runTask.textContent = S.mode === 'break' ? '쉬는 시간' : (S.task || '집중 시간');
      el.runCtl.hidden = S.confirm;
      el.confirmRow.hidden = !S.confirm;
      el.confirmQ.textContent = S.mode === 'break' ? '쉬는 시간을 그만할까요?' : '집중을 그만할까요?';
      last.soon = soon; last.paused = S.paused; last.mode = S.mode; last.confirm = S.confirm;
    }
  }

  function renderDone() {
    const focusDone = S.mode !== 'break';
    el.doneHead.className = focusDone ? 'dc-tb' : 'dc-tb rest';
    el.doneTag.textContent = focusDone ? 'TIME_UP' : 'BREAK_OVER';
    el.doneInner.setAttribute('fill', focusDone ? 'url(#dF)' : 'url(#dR)');
    el.doneH.textContent = focusDone ? '시간 다 됐어요!' : '쉬는 시간 끝!';
    el.doneSub.textContent = focusDone
      ? (S.task ? S.task + ' · ' : '') + label(Math.round(S.totalMs / 1000)) + ' 집중 끝!'
      : '다시 집중해 볼까요?';
    el.streak.hidden = !focusDone || !S.today;
    el.streakText.textContent = '집중 ' + S.today + '번 끝냈어요';
    el.restRow.hidden = !focusDone;
    el.restSel.value = String(S.restMin);
    el.restLabel.textContent = S.restMin + '분 쉬기';
    el.againLabel.textContent = '다시 집중하기 (' + label(focusSec() || 1500) + ')';
    el.againBtn.className = focusDone ? 'gp' : 'gp gp-big';
    el.muteBtn.hidden = !S.ringing;
  }
  const renderSound = () => el.soundBtn.setAttribute('aria-pressed', String(S.sound));

  /* ── 첫 화면 시계: 끌기 · 누르기 · 화살표 키 ── */
  function angleOf(e, svg, cx, cy, vbw) {
    const b = svg.getBoundingClientRect();
    const k = b.width / vbw;
    const dx = e.clientX - (b.left + cx * k);
    const dy = e.clientY - (b.top + cy * k);
    let a = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (a < 0) a += 360;
    return a;
  }
  let drag = null;
  function dialDown(e, kind) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const svg = e.currentTarget;
    try { svg.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
    svg.classList.add('dragging');
    drag = { kind, svg, prev: S.min };
    dialMove(e, true);
    (kind === 'min' ? el.kKnob : el.sKnob).focus({ preventScroll: true });
    e.preventDefault();
  }
  function dialMove(e, first) {
    if (!drag) return;
    if (drag.kind === 'sec') {
      const a = angleOf(e, drag.svg, 110, 116, 220);
      const v = a >= 90 && a < 270 ? 30 : 0;   // 30초씩: 아래 반쪽 = 30초
      if (v !== S.sec) setTime(S.min, v);
      return;
    }
    const raw = angleOf(e, drag.svg, 166, 166, 340) / 6;
    let v = Math.round(raw / 5) * 5;             // 5분씩
    if (!first) {                                 // 12시를 넘어 반대쪽으로 튀지 않게
      if (drag.prev >= 40 && raw < 20) v = 60;
      else if (drag.prev <= 20 && raw > 40) v = 0;
    }
    v = Math.max(0, Math.min(60, v));
    drag.prev = v;
    if (v !== S.min) setTime(v, S.sec);
  }
  function dialUp(e) {
    if (!drag) return;
    try { drag.svg.releasePointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
    drag.svg.classList.remove('dragging');
    drag = null;
  }
  el.minDial.addEventListener('pointerdown', (e) => dialDown(e, 'min'));
  el.secDial.addEventListener('pointerdown', (e) => dialDown(e, 'sec'));
  [el.minDial, el.secDial].forEach((svg) => {
    svg.addEventListener('pointermove', (e) => dialMove(e, false));
    svg.addEventListener('pointerup', dialUp);
    svg.addEventListener('pointercancel', dialUp);
    svg.addEventListener('lostpointercapture', dialUp);
  });
  el.kKnob.addEventListener('keydown', (e) => {
    let v = S.min;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = Math.min(60, Math.floor(v / 5) * 5 + 5);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = Math.max(0, Math.ceil(v / 5) * 5 - 5);
    else if (e.key === 'PageUp') v = Math.min(60, v + 10);
    else if (e.key === 'PageDown') v = Math.max(0, v - 10);
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 60;
    else return;
    e.preventDefault();
    setTime(v, S.sec);
  });
  el.sKnob.addEventListener('keydown', (e) => {
    let v;
    if (['ArrowRight', 'ArrowUp', 'End', 'PageUp'].includes(e.key)) v = 30;
    else if (['ArrowLeft', 'ArrowDown', 'Home', 'PageDown'].includes(e.key)) v = 0;
    else return;
    e.preventDefault();
    setTime(S.min, v);
  });

  /* ── 드롭다운 · 버튼 ── */
  function fill(sel, lo, hi) {
    for (let i = lo; i <= hi; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = String(i).padStart(2, '0');
      sel.appendChild(o);
    }
  }
  fill(el.minSel, 0, 60); fill(el.secSel, 0, 59); fill(el.restSel, 1, 30);
  el.minSel.addEventListener('change', () => setTime(Number(el.minSel.value), S.sec));
  el.secSel.addEventListener('change', () => setTime(S.min, Number(el.secSel.value)));
  el.setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const tot = focusSec();
    if (tot <= 0) { setErr(true); el.minSel.focus(); return; }
    S.task = el.taskInp.value.trim();
    begin('focus', tot * 1000);
  });
  el.pauseBtn.addEventListener('click', () => (S.paused ? resume() : pause()));
  el.stopBtn.addEventListener('click', () => { S.confirm = true; renderRun(true); el.keepBtn.focus(); });
  el.keepBtn.addEventListener('click', keepGoing);
  el.quitBtn.addEventListener('click', goHome);
  el.restSel.addEventListener('change', () => { S.restMin = Number(el.restSel.value); saveSettings(); renderDone(); });
  el.restBtn.addEventListener('click', () => begin('break', S.restMin * 60000));
  el.againBtn.addEventListener('click', () => begin('focus', (focusSec() || 1500) * 1000));
  el.homeBtn.addEventListener('click', goHome);
  el.muteBtn.addEventListener('click', () => { stopRinging(); renderDone(); el.doneH.focus(); });
  el.soundBtn.addEventListener('click', () => {
    S.sound = !S.sound;
    saveSettings(); renderSound();
    if (S.sound) audio(() => { armRing(); if (ac) chimeAt(ac.currentTime + 0.05); });
    else { stopRinging(); if (S.screen === 'done') renderDone(); }
  });

  const root = document.documentElement;
  if (!root.requestFullscreen) el.fsBtn.hidden = true;
  el.fsBtn.addEventListener('click', () => {
    try {
      const p = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 전체 화면을 못 쓰는 브라우저 */ }
  });
  document.addEventListener('fullscreenchange', () => el.fsBtn.setAttribute('aria-pressed', String(!!document.fullscreenElement)));

  // 타이머 화면: 스페이스 = 멈추기/계속하기(버튼에 포커스가 없을 때), Esc = 그만하기 묻는 줄 닫기
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'run') return;
    if (S.confirm && e.key === 'Escape') { e.preventDefault(); keepGoing(); return; }
    const a = document.activeElement;
    if (!S.confirm && e.key === ' ' && (!a || a === document.body)) { e.preventDefault(); if (S.paused) resume(); else pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (S.screen === 'run' || S.screen === 'done') wakeOn();
    if (S.screen === 'run' && !S.paused) { if (remaining() <= 0) finish(false); else { renderRun(true); loop(); } }
    if (S.screen === 'setup') renderEnd();
  });
  setInterval(() => { if (S.screen === 'setup') renderEnd(); }, 15000);
  // 새로고침 뒤 이어진 타이머: 첫 손짓에 소리를 깨워 끝 알림을 다시 예약
  const prime = () => audio(armRing);
  document.addEventListener('pointerdown', prime, { once: true, capture: true });
  document.addEventListener('keydown', prime, { once: true, capture: true });

  /* ── 시작 ── */
  const day = load(KEY.day);
  S.today = day && day.date === todayKey() ? (day.count || 0) : 0;
  renderSound();
  const ses = load(KEY.ses);
  if (ses && ses.totalMs > 0) {
    S.mode = ses.mode === 'break' ? 'break' : 'focus';
    S.totalMs = ses.totalMs;
    S.task = ses.task || '';
    el.taskInp.value = S.mode === 'focus' ? S.task : '';
    if (ses.paused) {
      S.paused = true;
      S.remainMs = Math.min(Math.max(0, ses.remainMs || 0), S.totalMs);
      show('run');
    } else {
      S.endAt = ses.endAt || 0;
      if (S.endAt - Date.now() > 0) { show('run'); armFinish(); loop(); } else { S.screen = 'run'; finish(true); }
    }
  } else {
    show('setup');
  }
})();
