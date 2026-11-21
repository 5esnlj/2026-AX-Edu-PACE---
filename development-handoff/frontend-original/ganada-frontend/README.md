# 가나다계단 프론트엔드 · UI 부품과 스타일

피그마 시안을 React + TypeScript 코드로 옮긴 **UI 부품(컴포넌트)과 스타일** 묶음입니다.
백엔드에 붙이기 전 단계라 데이터는 `src/mocks/` 예시를 씁니다.

- 피그마: https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH
- 화면 설명: `docs/HANDOFF.md` · AI 작업 규칙: `CLAUDE.md`

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
```

시연 화면 주소
- `#/teacher/dashboard` 교사 02 · 클래스 대시보드
- `#/teacher/materials` 교사 03 · 자료 목록(썸네일 카드)
- `#/student/dashboard` 학생 03 · 내 대시보드

| 명령 | 하는 일 |
|---|---|
| `npm run tokens` | `tokens/*.json`(Tokens Studio) → `src/styles/tokens.css` 다시 만들기 |
| `npm run build` | 토큰 생성 → 타입 검사 → 빌드 |
| `npm run check:hardcode` | 색 값·서버 주소·직접 fetch가 컴포넌트에 들어갔는지 점검 |
| `npm run figma:connect` | Code Connect를 피그마에 올리기(아래 3번 조건 필요) |

---

## 1. 디자인 토큰 (Tokens Studio → Style Dictionary)

```
tokens/global.json      ← 원본(Tokens Studio 형식). 색·둥글기·간격·글꼴·그림자
        │  npm run tokens  (style-dictionary + @tokens-studio/sd-transforms)
        ▼
src/styles/tokens.css   ← 자동 생성. --color-primary 같은 CSS 변수
```

- 값은 피그마 변수(Figma MCP `get_variable_defs`로 읽은 값)를 그대로 옮겼습니다.
- **값을 바꿀 때는 `tokens/global.json`만 고치고 `npm run tokens`.** `tokens.css`는 직접 고치지 않습니다.
- 피그마 쪽에서 관리하려면: 피그마에 **Tokens Studio 플러그인**을 설치하고 `tokens/` 폴더를 불러오면 같은 토큰이 플러그인에 뜹니다. 플러그인에서 고친 JSON을 다시 이 폴더에 넣고 `npm run tokens` 하면 코드에 반영됩니다(GitHub 동기화를 쓰면 자동).

교과·카드 색은 `data-tone="blue|yellow|green|orange|purple|red"`로 묶어 씁니다(`src/styles/base.css`). 교과→색은 `src/types.ts`의 `SUBJECT_TONE` 표 하나로 정합니다.

## 2. 컴포넌트 (`src/components/`)

| 부품 | 피그마 | 쓰는 곳 |
|---|---|---|
| `Button` (primary / secondary) | Button/Primary, Button/Secondary | 전체 |
| `TopBar` | TopBar/교사, TopBar/학생 | 상단바 |
| `Sidebar` (role, active) | Sidebar/교사, Sidebar/학생 | 클래스 안 화면 |
| `AppShell`, `PageHeader` | — | 화면 틀, 제목줄 |
| `NotchCard` | (파인 모서리) | MenuCard·MaterialCard 바탕 |
| `MenuCard` | Card/Menu | 클래스 목록 |
| `MaterialCard` | Card/Material | 자료 목록 썸네일 |
| `FolderCard` | — | 학생 대시보드 새로 받은 자료 |
| `SummaryTile` | — | 대시보드 요약 숫자 |
| `TableCard` (+ 표 스타일) | — | 명단·문항 표 |
| `LevelPill` | — | 초급 미달 / 초급 / 중급 / 고급 |
| `ProgressBar`, `Chip`, `Avatar`, `Logo`, `UploadBox` | — | 공통 |

- 스타일은 CSS Modules, 값은 전부 `tokens.css` 변수.
- 아이콘은 `lucide-react`(피그마 시안과 같은 Lucide 아이콘).
- **파인 모서리:** 카드 바탕만 CSS `mask`(`src/assets/notch-mask.svg`)로 파내서, 어떤 배경 위에서도 자연스럽게 보입니다.
- 서버 호출은 `src/api/`에만. 지금은 `VITE_USE_MOCK=true`(기본)라 `src/mocks/data.ts`를 씁니다. 실제 서버는 `.env.example` 참고.

## 3. Code Connect (`*.figma.ts`)

피그마 컴포넌트 9개 ↔ 코드 부품 연결 파일이 각 부품 폴더에 있습니다(템플릿 방식). 연결되면 피그마 Dev Mode에서 해당 컴포넌트를 눌렀을 때 이 코드 예시가 보이고, Figma MCP로 화면을 읽을 때도 AI가 이 부품을 그대로 재사용합니다.

> ⚠️ **플랜 조건:** Code Connect는 피그마 **Organization·Enterprise 플랜의 Dev/Full 좌석**에서만 올릴 수 있습니다. 지금 파일이 있는 학생(Education) 팀에서는 올리기가 막힐 가능성이 큽니다. 연결 파일은 준비돼 있으니, 조건이 되는 계정이 생기면 아래만 실행하면 됩니다.

```bash
npx figma connect parse                       # 연결 파일 점검(지금도 됨)
FIGMA_ACCESS_TOKEN=발급받은토큰 npm run figma:connect   # 피그마에 올리기
```

## 4. 남은 일

- 화면: `docs/HANDOFF.md`의 19개 중 3개만 시연용으로 조립했습니다. 나머지는 같은 부품으로 조립하면 됩니다.
- 화면 전환: `App.tsx`의 간단한 주소 전환은 시연용입니다. 실제로는 쓰는 라우터로 바꿔주세요.
- API: `src/api/index.ts`의 경로는 임시입니다. 백엔드 응답 이름이 다르면 api 함수 안에서 `src/api/types.ts` 모양으로 바꿔서 돌려주세요.
