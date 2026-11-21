# 가나다계단 프론트엔드 · AI 작업 규칙

이 파일은 AI 코딩 도구가 매번 읽는 규칙입니다.
- Claude Code: 프로젝트 맨 위 폴더에 `CLAUDE.md`로 둡니다.
- Cursor 등 다른 도구: 같은 내용을 `AGENTS.md`로 복사해 둡니다.

## 참고 파일
- 화면 설명: `HANDOFF.md`
- 디자인 값: `src/styles/tokens.css`
- 디자인 원본: 피그마 https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH (화면별 node-id는 HANDOFF.md에 있음)

## 1. 폴더 구조
```
src/
  api/          서버 호출만. 화면 코드는 여기 함수만 부른다
  mocks/        서버 연결 전 쓰는 예시 데이터
  components/   재사용 부품(Button, SummaryTile, TableCard, FolderCard, LevelPill, ProgressBar, Chip, Sidebar, TopBar …)
  pages/        화면 단위(HANDOFF.md의 화면 1개 = 파일 1개)
  styles/       tokens.css(전역)
  config.ts     API 주소 등 환경 값
```

## 2. 절대 규칙: 하드코딩 금지
1. **색·둥글기·간격·그림자·글자 크기는 `tokens.css` 변수만 쓴다.**
   `#EF5044`, `16px` 같은 값을 컴포넌트에 직접 쓰지 않는다. 필요한 값이 없으면 tokens.css에 변수를 먼저 추가한다.
2. **서버 주소·키는 `config.ts`(환경 변수)에만 둔다.** 코드 안에 `http://…`를 쓰지 않는다.
3. **서버 호출(fetch/axios)은 `src/api/`에만 둔다.** `pages/`, `components/`에서 직접 부르지 않는다.
4. **화면에 보이는 예시 데이터(이름, 점수, 클래스명)는 `src/mocks/`에만 둔다.** 페이지 코드에 직접 쓰지 않는다.
5. 예시 데이터와 실제 서버는 `config.ts`의 값 하나(`USE_MOCK`)로 바꿀 수 있게 한다.

## 3. 컴포넌트 규칙
- **새 UI를 만들기 전에 `components/`에 비슷한 부품이 있는지 먼저 찾아본다.** 있으면 재사용하고, 없을 때만 새로 만든다.
- `components/`의 부품은 화면 모양만 담당한다. 데이터를 직접 가져오지 않고 props로 받는다.
- 데이터 가져오기와 상태 관리는 `pages/`(또는 hooks)에서 한다.
- 아이콘은 Lucide를 쓴다.

## 4. 디자인 원칙
- **글자는 짧게.** 제목, 버튼, 핵심 숫자만 쓴다. 설명 문장을 화면에 길게 넣지 않는다.
- **레드(`--color-primary`)는 아껴 쓴다.** 주요 버튼, 지금 보는 메뉴, 경고(안 풂, 틀린 문제 많음)에만 쓴다. 진행 막대와 선택된 필터 칩은 차콜(`--color-text`)이다.
- 큰 영역은 흰색(`--color-surface`)이나 연한 카드색(`--card-*`)으로 채운다.
- 수준은 항상 `LevelPill`로 표시한다(초급 미달 / 초급 / 중급 / 고급).
- 화면 기준 너비는 1440px. 상단바 + 왼쪽 사이드바(260px) + 본문 구조다(HANDOFF.md 2장).

## 5. 커밋 전 점검
아래 검사에서 결과가 나오면 고친 뒤 커밋한다.
```bash
# 1) 컴포넌트·페이지에 색 값이 직접 들어갔는지
grep -rnE "#[0-9A-Fa-f]{3,8}\b|rgb\(" src/components src/pages
# 2) 서버 주소가 직접 들어갔는지
grep -rn "http" src/components src/pages
# 3) api 폴더 밖에서 서버를 부르는지
grep -rnE "fetch\(|axios" src/components src/pages
```
