/* 수정 요청 메모(피드백 모드) — 선생님 전용. info lesson 의 shared/runtime/msi-memo.js 를 타이머에 맞게 옮긴 것.
 * 타이머 화면에서 글을 드래그하거나 "🎯 요소 고르기"로 요소를 클릭해 고르고, 요청을 적어 보낸다. 두 가지 방식:
 *   - 이 PC 미리보기(npm run memo, 127.0.0.1): "📤 보내기" → scripts/serve.mjs 가 .claude/feedback.md 에 쌓는다.
 *   - 그 밖(GitHub Pages): "목록에 담기" → "전체 복사" → Claude 대화에 붙여넣기. 목록은 이 브라우저(localStorage)에만 있다.
 * 켜기: 주소 끝에 ?memo=1 (그 브라우저에 기억됨) / 끄기: ?memo=0.  켜지 않으면 아무것도 하지 않는다 → 다른 사람 화면에는 안 보임. */
(function () {
  'use strict';
  var FLAG = 'msi-memo-on';
  var q = '';
  try { q = new URLSearchParams(location.search).get('memo') || ''; } catch (e) {}
  try { if (q === '1') localStorage.setItem(FLAG, '1'); else if (q === '0') localStorage.removeItem(FLAG); } catch (e) {}
  var on = q === '1';
  try { if (q !== '0' && localStorage.getItem(FLAG) === '1') on = true; } catch (e) {}
  if (!on) return;

  // ── 이 앱 이름(기록 제목줄에 쓰임) ──
  var lessonId = 'timer';
  var lessonTitle = '뽀모도로 타이머';
  var STORE = 'msi-memo-items:' + lessonId;

  var items = [];
  try { items = JSON.parse(localStorage.getItem(STORE) || '[]') || []; } catch (e) { items = []; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(items)); } catch (e) {} }

  var root, btn, panel, quoteBox, noteBox, listBox, toastEl, addB, pickB, row2, hint, hilite, last = null;

  // ── 이 PC 미리보기면 서버(/__feedback)로 보낸다. GitHub Pages 에는 그 주소가 없어 복사 방식 그대로 ──
  var server = false, sent = [];
  function api(method, body) {
    var get = method === 'GET';
    return fetch('/__feedback' + (get ? '?lesson=' + encodeURIComponent(lessonId) : ''),
      get ? {} : { method: method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function refresh() { return api('GET').then(function (j) { sent = j.entries || []; renderList(); }); }

  function visible(el) { return !!(el && el.getClientRects && el.getClientRects().length); }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function plain(s) { return clean(s).replace(/^[^0-9A-Za-z가-힣]+/, ''); }   // 앞의 이모지·기호 떼기
  function cut(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

  // ── 선택한 글 붙잡기(칸 안 글·일반 글 모두). 폰에서는 버튼을 눌러도 선택이 풀릴 수 있어 마지막 선택을 기억한다 ──
  function grab() {
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && !(root && root.contains(ae))
        && typeof ae.selectionStart === 'number' && ae.selectionStart !== ae.selectionEnd) {
      var t0 = clean(ae.value.slice(ae.selectionStart, ae.selectionEnd));
      if (t0) return { text: t0, el: ae };
    }
    var s = window.getSelection && window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    var t = clean(s.toString());
    if (!t) return null;
    var n = s.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    if (!el || (root && root.contains(el))) return null;
    return { text: t, el: el };
  }
  function remember() { var g = grab(); if (g) { last = g; if (panel && panel.style.display !== 'none') showQuote(); } }
  document.addEventListener('selectionchange', remember);
  document.addEventListener('select', remember, true);

  // ── 요소 고르기(피드백 모드처럼): 켜면 마우스를 올린 요소에 테두리, 클릭하면 그 요소를 고른다. 그동안 활동지 버튼·탭은 반응하지 않는다. Esc 취소 ──
  var picking = false;
  function describe(e) {   // div.m-title 같은 짧은 이름. 클래스가 없으면 클래스 있는 가장 가까운 부모를 앞에 붙인다(button.tab-chip › span)
    function one(x) {
      var c = typeof x.className === 'string' ? x.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      return x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (c.length ? '.' + c.join('.') : '');
    }
    var s = one(e);
    if (s.indexOf('.') < 0 && s.indexOf('#') < 0) {
      var up = e.parentElement && e.parentElement.closest('[class], [id]');
      if (up && up !== document.body) s = one(up) + ' › ' + s;
    }
    return s;
  }
  function textOf(e) {
    var t = clean(e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('aria-label') || e.getAttribute('alt') || '');
    return cut(t, 200);
  }
  function setPicking(on) {
    picking = on;
    document.documentElement.classList.toggle('mm-picking', on);
    pickB.textContent = on ? '🎯 고르는 중… (Esc 취소)' : '🎯 요소 고르기';
    if (!on) hilite.style.display = 'none';
  }
  function outside(e) { return e && e.nodeType === 1 && !(root && root.contains(e)); }
  document.addEventListener('mousemove', function (e) {
    if (!picking || !outside(e.target)) return;
    var r = e.target.getBoundingClientRect();
    hilite.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  }, true);
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'click'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!picking || !outside(e.target)) return;
      if (type !== 'touchstart') e.preventDefault();
      e.stopPropagation(); e.stopImmediatePropagation();
      if (type !== 'click') return;
      last = { text: textOf(e.target), el: e.target, element: describe(e.target) };
      setPicking(false); panel.style.display = 'block'; showQuote(); noteBox.focus();
    }, true);
  });
  document.addEventListener('keydown', function (e) { if (picking && e.key === 'Escape') { e.preventDefault(); setPicking(false); } }, true);

  // ── 위치 알아내기: 화면(첫 화면·타이머·끝난 화면) › 부분(제목줄·시계·설정 카드…) · 칸 이름 ──
  var SCREENS = { scrSetup: '첫 화면', scrRun: '타이머 화면', scrDone: '끝난 화면' };
  var PARTS = [['.tb', '제목줄'], ['.dialbox', '시계'], ['.setup-card', '설정 카드'], ['.cluster', '할 일'], ['.dg', '숫자'],
    ['.disc', '원판'], ['.ctl', '멈추기·그만하기 버튼'], ['.confirm', '그만할까요 줄'], ['.rest-row', '쉬는 시간 줄'], ['.dc-ft', '아래 버튼'], ['.dcard', '끝난 카드']];
  function locate(el) {
    var parts = [];
    var scr = el.closest && el.closest('.screen');
    if (scr && SCREENS[scr.id]) parts.push(SCREENS[scr.id]);
    else if (el.closest && el.closest('.tb')) parts.push('모든 화면');
    for (var i = 0; i < PARTS.length; i++) if (el.closest && el.closest(PARTS[i][0])) { parts.push(PARTS[i][1]); break; }
    var lab = el.closest && el.closest('[aria-label]');
    var field = lab && !(root && root.contains(lab)) ? clean(lab.getAttribute('aria-label')) : '';
    return { where: parts.join(' › '), field: field };
  }

  // ── 화면 ──
  var CSS =
    '#msi-memo{position:fixed;right:14px;bottom:14px;z-index:2147483000;font-family:"Maplestory","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#4b3b6b;font-size:14px;line-height:1.5}' +
    '#msi-memo *{box-sizing:border-box}' +
    '#msi-memo .mm-fab{display:block;margin-left:auto;cursor:pointer;padding:8px 13px;border:3px solid #4b3b6b;border-radius:9px;background:#d6c4f5;color:#4b3b6b;box-shadow:3px 3px 0 rgba(75,59,107,.25);' +
      'font-family:"CookieRun","Maplestory",sans-serif;font-weight:700;font-size:14px;white-space:nowrap}' +
    '#msi-memo .mm-fab:hover{background:#fbe6a2}' +
    '#msi-memo .mm-panel{display:none;width:min(360px,calc(100vw - 28px));max-height:min(75vh,640px);overflow:auto;margin-bottom:8px;padding:12px;border:3px solid #4b3b6b;border-radius:12px;background:#fffdf7;box-shadow:5px 5px 0 rgba(75,59,107,.22)}' +
    '#msi-memo .mm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-family:"CookieRun","Maplestory",sans-serif;font-weight:700;font-size:15px}' +
    '#msi-memo .mm-x{cursor:pointer;border:2px solid #4b3b6b;border-radius:7px;background:#fffdf7;color:#4b3b6b;padding:0 8px;font-size:15px;line-height:1.4}' +
    '#msi-memo .mm-quote{margin:0 0 8px;padding:8px 10px;border:2px dashed #b3a8cc;border-radius:9px;background:#f4f8fe;font-size:13px;word-break:keep-all}' +
    '#msi-memo .mm-quote.empty{color:#8b7cb8}' +
    '#msi-memo textarea{display:block;width:100%;min-height:64px;margin:0 0 8px;padding:8px 10px;border:3px solid #4b3b6b;border-radius:9px;background:#fdf6fa;color:#4b3b6b;font:inherit;resize:vertical}' +
    '#msi-memo textarea:focus{outline:none;border-color:#ee9dbf;background:#fff}' +
    '#msi-memo .mm-btn{cursor:pointer;padding:6px 11px;border:3px solid #4b3b6b;border-radius:9px;background:#9db2f2;color:#26224a;font-family:"CookieRun","Maplestory",sans-serif;font-weight:700;font-size:13px;box-shadow:2px 2px 0 rgba(75,59,107,.25)}' +
    '#msi-memo .mm-btn.ghost{background:#fffdf7;color:#4b3b6b}' +
    '#msi-memo .mm-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}' +
    '#msi-memo .mm-list{margin:0 0 8px;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}' +
    '#msi-memo .mm-item{padding:7px 9px;border:2px solid #4b3b6b;border-radius:9px;background:#fff;font-size:13px;word-break:keep-all}' +
    '#msi-memo .mm-item .mm-w{color:#8b7cb8;font-size:12px}' +
    '#msi-memo .mm-item .mm-del{float:right;cursor:pointer;border:0;background:none;color:#a65a86;font-size:13px}' +
    '#msi-memo .mm-hint{margin:0;color:#8b7cb8;font-size:12px}' +
    '#msi-memo .mm-toast{position:absolute;left:0;right:0;bottom:48px;text-align:center;pointer-events:none;opacity:0;transition:opacity .2s}' +
    '#msi-memo .mm-toast span{display:inline-block;padding:5px 11px;border:3px solid #4b3b6b;border-radius:9px;background:#d8f0c4;font-family:"CookieRun","Maplestory",sans-serif;font-weight:700;font-size:13px}' +
    '#msi-memo .mm-hilite{display:none;position:fixed;pointer-events:none;z-index:2147482999;border:3px dashed #ee9dbf;border-radius:6px;background:rgba(238,157,191,.12)}' +
    'html.mm-picking,html.mm-picking *{cursor:crosshair!important}' +
    'html.mm-picking #msi-memo,html.mm-picking #msi-memo *{cursor:default!important}' +
    '@media print{#msi-memo{display:none!important}}';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function showQuote() {
    if (last && (last.text || last.element)) {
      quoteBox.className = 'mm-quote';
      quoteBox.textContent = (last.element ? '🎯 ' + last.element + (last.text ? ' — ' : '') : '') + (last.text ? '“' + cut(last.text, 160) + '”' : '');
    }
    else { quoteBox.className = 'mm-quote empty'; quoteBox.textContent = '고치고 싶은 글을 드래그하거나 "🎯 요소 고르기"로 클릭해 보세요. (고르지 않고 적어도 돼요)'; }
  }
  function renderList() {
    listBox.textContent = '';
    var list = server ? sent : items;
    list.forEach(function (it, i) {
      var li = el('li', 'mm-item');
      var del = el('button', 'mm-del', '✕'); del.type = 'button'; del.setAttribute('aria-label', (i + 1) + '번 메모 지우기');
      del.onclick = server
        ? function () { api('DELETE', { key: it.key }).then(refresh, function (e) { toast(String(e.message || '지우지 못했어요')); refresh(); }); }
        : function () { items.splice(i, 1); save(); renderList(); };
      li.appendChild(del);
      li.appendChild(el('div', '', (i + 1) + '. ' + it.note));
      if (it.text) li.appendChild(el('div', 'mm-w', '“' + cut(it.text, 70) + '”'));
      listBox.appendChild(li);
    });
    btn.textContent = '📝 메모' + (list.length ? ' (' + list.length + ')' : '');
  }
  function toast(msg) {
    toastEl.firstChild.textContent = msg; toastEl.style.opacity = '1';
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 1600);
  }
  function add() {
    var note = noteBox.value.trim();
    if (!note) { toast('요청을 적어 주세요'); noteBox.focus(); return; }
    var it = { note: note, text: '', where: '', field: '', element: '' };
    if (last && last.el) { it.text = last.text; it.element = last.element || ''; var w = locate(last.el); it.where = w.where; it.field = w.field; }
    if (server) {
      it.lesson = lessonId; it.title = lessonTitle; it.viewport = window.innerWidth + '×' + window.innerHeight;
      api('POST', it).then(function () {
        noteBox.value = ''; last = null; showQuote(); toast('보냈어요'); return refresh();
      }, function () { toast('보내지 못했어요 — 미리보기 서버를 확인해 주세요'); });
      return;
    }
    items.push(it); save();
    noteBox.value = ''; last = null; showQuote(); renderList(); toast('목록에 담았어요');
  }
  function format() {
    var out = ['[수정 요청] ' + lessonId + (lessonTitle ? ' 「' + lessonTitle + '」' : ''), ''];
    items.forEach(function (it, i) {
      out.push((i + 1) + '. ' + it.note);
      if (it.where) out.push('   위치: ' + it.where + (it.field ? ' (칸: ' + it.field + ')' : ''));
      else if (it.field) out.push('   칸: ' + it.field);
      if (it.element) out.push('   요소: ' + it.element);
      if (it.text) out.push('   선택한 글: “' + it.text + '”');
    });
    return out.join('\n');
  }
  function copy() {
    if (!items.length) { toast('담은 메모가 없어요'); return; }
    var text = format();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); toast(ok ? '복사됐어요. Claude 에 붙여넣으세요' : '복사하지 못했어요');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('복사됐어요. Claude 에 붙여넣으세요'); }, fallback);
    else fallback();
  }

  function build() {
    var st = document.createElement('style'); st.id = 'msi-memo-style'; st.textContent = CSS; document.head.appendChild(st);
    root = el('div'); root.id = 'msi-memo'; root.setAttribute('data-msi-memo', '');

    panel = el('div', 'mm-panel'); panel.style.display = 'none'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '수정 요청 메모');
    var head = el('div', 'mm-head'); head.appendChild(el('span', '', '✏️ 수정 요청 메모'));
    var x = el('button', 'mm-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '메모 창 닫기'); x.onclick = function () { panel.style.display = 'none'; };
    head.appendChild(x); panel.appendChild(head);

    quoteBox = el('p', 'mm-quote empty'); panel.appendChild(quoteBox);
    noteBox = el('textarea'); noteBox.setAttribute('aria-label', '수정 요청 내용'); noteBox.placeholder = '어떻게 고치면 좋을지 적어요'; panel.appendChild(noteBox);

    var row1 = el('div', 'mm-row');
    pickB = el('button', 'mm-btn ghost', '🎯 요소 고르기'); pickB.type = 'button'; pickB.onclick = function () { setPicking(!picking); if (picking) toast('고칠 곳을 클릭하세요'); };
    addB = el('button', 'mm-btn', '➕ 목록에 담기'); addB.type = 'button'; addB.onclick = add; row1.appendChild(pickB); row1.appendChild(addB);
    panel.appendChild(row1);

    listBox = el('ul', 'mm-list'); panel.appendChild(listBox);
    row2 = el('div', 'mm-row');
    var cpB = el('button', 'mm-btn', '📋 전체 복사'); cpB.type = 'button'; cpB.onclick = copy;
    var clB = el('button', 'mm-btn ghost', '🗑 모두 지우기'); clB.type = 'button';
    clB.onclick = function () { if (!items.length || confirm('담은 메모를 모두 지울까요?')) { items = []; save(); renderList(); } };
    row2.appendChild(cpB); row2.appendChild(clB); panel.appendChild(row2);
    hint = el('p', 'mm-hint', '복사한 글을 Claude 대화에 붙여넣으세요. 이 메모는 이 브라우저에만 있어요. 끄려면 주소 끝에 ?memo=0'); panel.appendChild(hint);

    btn = el('button', 'mm-fab', '📝 메모'); btn.type = 'button';
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });   // 데스크톱: 글 선택이 풀리지 않게
    btn.onclick = function () {
      var open = panel.style.display === 'none' || !panel.style.display;
      panel.style.display = open ? 'block' : 'none';
      if (open) { remember(); showQuote(); }
    };
    toastEl = el('div', 'mm-toast'); toastEl.appendChild(el('span', '', ''));
    hilite = el('div', 'mm-hilite'); root.appendChild(hilite);
    root.appendChild(panel); root.appendChild(toastEl); root.appendChild(btn);
    document.body.appendChild(root);
    renderList(); showQuote();
    if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      api('GET').then(function (j) {
        server = true; sent = j.entries || [];
        addB.textContent = '📤 보내기'; row2.style.display = 'none';
        hint.textContent = '보낸 요청은 .claude/feedback.md 에 쌓여요. 위 목록은 아직 처리 전인 것. Claude 에게 "피드백 처리해줘" 라고 하세요. 끄려면 주소 끝에 ?memo=0';
        renderList();
      }, function () {});
    }
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
