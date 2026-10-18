#!/usr/bin/env node
// "피드백 모드 켜줘" — npm run memo
// ① 미리보기 서버(8090)가 꺼져 있으면 뒤에서 켬 ② http://127.0.0.1:8090/?memo=1 을 브라우저로 연다.
// 이 주소에서 연 메모 창은 "📤 보내기"로 요청을 .claude/feedback.md 에 바로 쌓는다(scripts/serve.mjs).
// 서버는 PC 를 끄거나 작업 관리자에서 node 를 끝내면 꺼진다.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:8090';
const fbUp = async () => { try { return (await fetch(base + '/__feedback', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
const anyUp = async () => { try { await fetch(base + '/', { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; } };

let started = false;
if (!(await fbUp())) {
  if (await anyUp()) {
    console.error('✖ 8090 포트를 다른 프로그램(피드백 기능 없는 서버)이 쓰고 있어요. 그 node 를 끄고 다시 `npm run memo` 하세요.');
    process.exit(1);
  }
  spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  started = true;
  for (let i = 0; i < 20 && !(await fbUp()); i++) await new Promise((r) => setTimeout(r, 300));
  if (!(await fbUp())) { console.error('✖ 미리보기 서버를 켜지 못했어요. `npm run serve` 로 직접 켜 보세요.'); process.exit(1); }
}
const url = `${base}/?memo=1`;
if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
console.log(`✔ 피드백 모드 켰어요${started ? ' (미리보기 서버도 새로 켬)' : ''}: ${url}`);
console.log('  글 드래그 또는 🎯 요소 고르기 → 오른쪽 아래 📝 메모 → 요청 적기 → 📤 보내기(.claude/feedback.md) → Claude 에 "피드백 처리해줘"');
console.log('  끄기: 주소 끝을 ?memo=0 으로 열기');
