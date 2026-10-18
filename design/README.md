# 디자인 토큰 — 수업 활동지 디자인을 다른 웹앱에

정보 수업 활동지의 레트로 "프로그램 창" 디자인을 다른 웹앱에서 그대로 쓰기 위한 토큰·부품 모음입니다.
두꺼운 남보라 테두리 + 블러 없는 하드 섀도우 + 파스텔 격자 배경 + 교육용 서체 3단(제목·라운드·본문) + 픽셀 영문 라벨.
원본 규칙은 [`docs/rules/design.md`](../docs/rules/design.md) — 값이 다르면 그 문서가 기준입니다.

| 파일 | 내용 |
|---|---|
| `tokens.json` | **원본.** 색·서체·글자 크기·줄 간격·여백·폭·테두리·모서리·그림자·그라디언트·포커스·움직임 (W3C Design Tokens 형식) |
| `tokens.css` | 위에서 만든 CSS 변수(`--msi-…`) + `@font-face` + `@keyframes msi-floaty` — **직접 고치지 않음** |
| `components.css` | 토큰으로 만든 기본 부품(`.msi-…`): 격자 바탕, 창+타이틀바, 주제·일반 카드, 픽셀 태그, 힌트 상자, 버튼, 칩, 입력칸, 체크 행, NOTE, 표, 상태 알약, 포커스·인쇄 + **활동 부품**(ai/01 — 가운데 버튼 줄·이름표 2열·개념 표/카드·고르기·O/X·그림+영상, 치수 `part` 토큰, 규칙 `docs/rules/parts.md`) |
| `fonts/` | GangwonEdu · CookieRun(400/700) · Maplestory(300/700) · Silkscreen(400/700) woff2 |
| `preview.html` | 브라우저로 열면 색·서체·부품을 한눈에 (자동 생성) |
| `build.mjs` | `node design/build.mjs` → `tokens.css` · `preview.html` 다시 만들기 |

## 다른 웹앱에 붙이기

**1) `design` 폴더를 통째로 복사**합니다(`fonts/` 가 `tokens.css` 옆에 있어야 서체가 나옵니다).

**2-a) 그냥 HTML**
```html
<link rel="stylesheet" href="design/tokens.css">
<link rel="stylesheet" href="design/components.css">   <!-- 부품까지 쓸 때 -->
```

**2-b) Vite · React 등** — 진입점(`main.jsx` 등)에서 불러오면 폰트 경로도 번들러가 알아서 처리합니다.
```js
import '../design/tokens.css';
import '../design/components.css';
```

**3) 이 디자인을 쓸 영역을 `.msi-page` 로 감쌉니다.** 그 안에만 서체·글자색·격자 배경이 적용되고, 앱의 `body` 나 다른 화면은 그대로입니다.
```html
<div class="msi-page"><div class="msi-wrap">
  <div class="msi-window">
    <div class="msi-titlebar"><div class="msi-win-title">🏫 앱 이름</div><div class="msi-spacer"></div>
      <div class="msi-win-btns"><span>_</span><span>□</span><span class="x">X</span></div></div>
    <div class="msi-win-body">
      <section class="msi-card" style="--accent:var(--msi-accent-1)">
        <div class="msi-card-head"><span>ACTIVITY_1</span><span class="r">WRITE</span></div>
        <div class="msi-card-body"> … </div>
      </section>
    </div>
  </div>
</div></div>
```
부품 없이 토큰만 쓸 때는 앱의 CSS 에서 `color:var(--msi-ink); border:var(--msi-bw-default) solid var(--msi-ink); box-shadow:var(--msi-shadow-card)` 처럼 씁니다.
전체 목록은 `preview.html` 이나 `tokens.css` 를 보세요.

## 이름 규칙 — 모두 `msi-` 로 시작 (다른 앱의 `--ink`·`.card` 와 안 부딪히게)

| 묶음 | CSS 변수 | 예 |
|---|---|---|
| 색 | `--msi-<이름>` | `--msi-ink` `--msi-paper` `--msi-pink` `--msi-accent-1`~`8` `--msi-status-live-bg` |
| 서체 | `--msi-font-<역할>` | `display` 제목 · `round` 소제목·버튼 · `body` 본문 · `pixel` 영문 라벨 |
| 글자 크기 | `--msi-fs-<단계>` | `display-lg` 30 · `display-md` 25 · `title` 20 · `body` 15 · `small` 14 · `pixel` 11 |
| 여백·폭 | `--msi-space-…` · `--msi-size-…` | `--msi-space-stack` 18px · `--msi-size-content-max` 1080px |
| 테두리·모서리 | `--msi-bw-…` · `--msi-radius-…` | `--msi-bw-default` 3px · `--msi-radius-card` 14px |
| 그림자 | `--msi-shadow-<요소>` | `window` · `card` · `button` · `chip` · `press` (전부 블러 0) |

부품 클래스도 `.msi-card` `.msi-btn` `.msi-chip` … 이고, 상태는 `.is-on` 또는 `aria-pressed="true"`.

## 지킬 것 (design.md 요약)

- 테두리·글자는 `--msi-ink`, 그림자는 **오프셋만·블러 0**. 눌림은 그림자를 줄이고 `translate(3px,3px)`.
- 한글은 **제목 = display, 나머지 = round 또는 body** 만. `pixel`(Silkscreen)은 영문·숫자 전용 — 한글이 섞인 라벨에 쓰지 않습니다.
- 작은 설명 글자는 `--msi-muted-2`(크림 위 5.8:1). `--msi-muted` 는 3.6:1 이라 큰 글자·장식에만.
- 카드 accent 는 `--msi-accent-1`~`8` 순서로 돌려 쓰고, 9번째는 다시 1번(또는 예비색 `sage`·`sky-2`·`moss`·`rose-dust`·`peri`).
- 상태는 색 + 글자 둘 다(`.msi-status` 에 "완료/진행 중/예정" 글자). 포커스 테두리는 지우지 않습니다.
- 밝은 테마 하나뿐(레트로 창). 다크 모드는 따로 만들지 않았습니다.

## 고칠 때

값은 **`tokens.json` 만** 고치고 `node design/build.mjs` → `tokens.css`·`preview.html` 이 다시 만들어집니다.
부품 모양은 `components.css` 를 고칩니다. 활동지 쪽(`docs/rules/design.md`)과 값이 달라지지 않게, 바꿀 땐 그 문서도 같이 봅니다.

**역할 색(`role`, 2026-10-16~)** — 카드 머리·몸통, 고른 탭, 보기 버튼, 급식 요일, 과목 19색처럼 "어디에 어떤 색"을 이름으로 묶은 토큰(`--msi-role-…`).
`node design/build.mjs` 가 같이 만드는 것: 표 `docs/rules/color-map.md`, 그리고 `<style id="msi-role-tokens">` 표식이 있는 활동지
(새 차시 틀 `lessons/_templates/order` 와 거기서 만든 차시)의 색 블록 — 활동지는 한 파일로 돌아가야 해서 tokens.css 를 불러오지 않고 값을 직접 넣습니다.
같은 블록에 **유리(`glass` → `--msi-glass-*`) · 움직임(`motion` → `--msi-motion-*`) · 크기(`size`, 손가락 최소 44px `--msi-size-touch-min`)**도 함께 들어갑니다(2026-10-16).

서체 파일은 이 저장소 `shared/fonts/` 와 같은 것입니다. 다른 곳에 배포할 때는 각 서체의 배포처 라이선스를 확인하세요.
