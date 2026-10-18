#!/usr/bin/env node
// 타이머를 내 컴퓨터에서 열어 보기 — npm run serve → http://127.0.0.1:8090/ (끄려면 Ctrl + C)
// 피드백 모드(?memo=1)의 "📤 보내기"도 여기서 받아 .claude/feedback.md 에 쌓는다. GitHub Pages 에는 이 주소가 없다.
//   GET    /__feedback → { ok, file, open, entries }  (처리 전 항목, 오래된 것부터)
//   POST   /__feedback  { lesson, title, note, text, element, where, field, viewport } → 항목 추가
//   DELETE /__feedback  { key }  → 처리 전 항목 지우기 (key = 제목줄 "시각 · timer 「제목」")
// info lesson 의 scripts/serve.mjs 와 같은 방식(같은 보안 규칙).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8090;
const FILE = path.join(ROOT, '.claude', 'feedback.md');
const HEADER = `# 화면 피드백

타이머 미리보기(\`npm run memo\`, ?memo=1)의 "📤 보내기"로 쌓인 수정 요청. 처리하면 \`[ ]\` 를 \`[x]\` 로 바꾸고 한 줄로 무엇을 했는지 적는다.
(Claude: 세션 시작 때 이 파일에 \`[ ]\` 가 있으면 먼저 알리고 처리할 것. 이 파일은 git 에 올리지 않는다.)

`;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' };
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const read = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '');

function format(f) {
  const when = new Date().toLocaleString('ko-KR', { hour12: false });
  const lines = [`## ${when} · timer 「${oneLine(f.title) || '뽀모도로 타이머'}」`, '- 종류: 메모'];
  if (f.element) lines.push(`- 요소: ${oneLine(f.element)}`);
  if (f.where || f.field) lines.push(`- 위치: ${oneLine(f.where) || '?'}${f.field ? ` (칸: ${oneLine(f.field)})` : ''}`);
  if (f.text) lines.push(`- 선택한 글: "${oneLine(f.text)}"`);
  lines.push(`- 메모: ${oneLine(f.note)}`, `- 화면: 뽀모도로 타이머 · ${oneLine(f.viewport)}`, '- 상태: [ ] 처리 전', '');
  return lines.join('\n') + '\n';
}

function entries(text) {
  const get = (lines, label) => lines.find((l) => l.startsWith(`- ${label}: `))?.slice(label.length + 4) ?? '';
  return text.split(/\n(?=## )/).filter((x) => x.startsWith('## ')).map((sec) => {
    const lines = sec.split('\n');
    return { key: lines[0].slice(3), open: get(lines, '상태').startsWith('[ ]'), note: get(lines, '메모'), text: get(lines, '선택한 글').replace(/^"|"$/g, '') };
  }).filter((e) => e.open);
}

function feedback(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/__feedback') return false;
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  // 다른 웹사이트가 이 PC 서버로 글을 끼워 넣지 못하게(feedback.md 는 Claude 가 수정 지시로 읽는다):
  // 주소는 127.0.0.1·localhost 로만, Origin 이 붙으면 같은 곳만, 쓰기는 JSON 으로만.
  const isLocal = (h) => h === '127.0.0.1' || h === 'localhost';
  let sameOrigin = true;
  if (req.headers.origin) { try { const o = new URL(req.headers.origin); sameOrigin = isLocal(o.hostname) && o.host === req.headers.host; } catch { sameOrigin = false; } }
  if (!isLocal((req.headers.host || '').replace(/:\d+$/, '')) || !sameOrigin) { json(403, { ok: false, error: '이 PC 미리보기 화면에서만 쓸 수 있어요.' }); return true; }
  if (req.method !== 'GET' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) { json(415, { ok: false, error: 'JSON 으로만 보낼 수 있어요.' }); return true; }
  if (req.method === 'GET') {
    const text = read();
    json(200, { ok: true, file: '.claude/feedback.md', open: (text.match(/^- 상태: \[ \]/gm) ?? []).length, entries: entries(text) });
    return true;
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') { json(405, { ok: false }); return true; }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 100000) req.destroy(); });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (req.method === 'POST') {
        if (!oneLine(data.note)) return json(400, { ok: false, error: '요청을 적어 주세요.' });
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, HEADER, 'utf8');
        fs.appendFileSync(FILE, format(data), 'utf8');
        return json(200, { ok: true });
      }
      const parts = read().split(/\n(?=## )/);
      const i = parts.findIndex((x) => x.startsWith('## ') && x.split('\n')[0].slice(3) === data.key);
      if (i < 0) return json(404, { ok: false, error: '항목을 찾을 수 없어요(이미 지워졌거나 파일이 바뀜).' });
      if (!/^- 상태: \[ \]/m.test(parts[i])) return json(409, { ok: false, error: '이미 처리된 항목은 지울 수 없어요.' });
      parts.splice(i, 1);
      fs.writeFileSync(FILE, parts.join('\n').replace(/\n*$/, '\n\n'), 'utf8');
      json(200, { ok: true });
    } catch (e) {
      json(400, { ok: false, error: String(e.message ?? e) });
    }
  });
  return true;
}

function serveFile(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('..') || rel.split(path.sep).some((s) => s.startsWith('.') && s !== '.nojekyll') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}

http.createServer((req, res) => { if (!feedback(req, res)) serveFile(req, res); })
  .listen(PORT, '127.0.0.1', () => console.log(`▶ http://127.0.0.1:${PORT}/  (끄려면 Ctrl + C)`));
