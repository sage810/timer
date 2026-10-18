# PROJECT_MAP — 뽀모도로 타이머

이 프로젝트에 어떤 파일/폴더가 있고 각각 뭘 하는지만 적는다. 왜 그렇게 만들었는지(판단 이유)는 여기 적지 않는다 — 그건 `.design/decisions.log` 몫이다. 새 파일을 만들거나 지울 때마다 그 즉시 한 줄씩 갱신한다. 나중에 몰아서 정리하지 않는다.

## 구조

```
timer/
├─ index.html       화면 3개 — 첫 화면 · 타이머 · 끝난 화면
├─ app.css          모양 (msi- 토큰 + 타이머 역할 토큰)
├─ app.js           동작 (시계 끌기 · 타이머 · 알림음 · 저장)
├─ favicon.svg      탭 아이콘
├─ .nojekyll        GitHub Pages 가 파일을 그대로 내보내게
├─ README.md        쓰는 법 · 파일 · 올리기
├─ PROJECT_MAP.md   지금 이 파일
└─ design/          디자인 토큰·부품·글꼴 (모두 msi- 이름, 수업 활동지와 같은 것)
```

## 파일별 설명

| 경로 | 역할 |
|---|---|
| `index.html` | 화면 3개의 뼈대. 시계 SVG 와 버튼이 모두 여기 있다 |
| `app.css` | 디자인 토큰(`design/tokens.css`)만 쓰는 모양. 타이머 색은 `--msi-role-timer-*` |
| `app.js` | 시계 바늘 끌기·화살표 키, 남은 시간 계산, 알림음 예약, 화면 꺼짐 막기, 이 기기 저장 |
| `design/tokens.css` · `fonts/` | 색·글꼴 토큰과 woff2 글꼴 — 앱이 직접 불러온다 |
| `design/tokens.json` · `build.mjs` · `components.css` · `preview.html` | 디자인 토큰 원본과 부품 — 앱은 쓰지 않음(참고용) |
| 시안 캔버스(아티팩트) | 시안 A·B·C 와 A-1 시계 시안 — https://claude.ai/artifact/Bt55GcjsRppxGrNYaPyhX9 |
