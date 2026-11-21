# 가나다계단 프론트엔드 · API 연동 확인본

첨부된 React + TypeScript + Vite 프론트엔드의 **3개 화면**을 별도 FastAPI mock과 연결한 버전입니다. 교사 대시보드·교사 원본 자료 목록·학생 대시보드를 확인할 수 있습니다. 실제 DB·Solar 연결 및 나머지 업무 화면이 완성된 제품은 아닙니다.

## 실행 (Windows / VS Code)

다운로드한 전체 묶음에서 `api`와 `frontend`가 나란히 있어야 합니다. VS Code에서 전체 묶음 폴더를 열고 터미널 두 개를 만드세요.

터미널 1 — API mock:

```powershell
cd api
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn mock_server:app --host 127.0.0.1 --port 8081
```

터미널 2 — 프론트엔드:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

터미널 2에 표시되는 Local 주소를 엽니다. 기본 주소는 `http://localhost:5173`이며 다른 프로그램이 사용 중이면 Vite가 다음 포트를 선택할 수 있습니다. 두 터미널을 실행 상태로 두세요.

macOS/Linux에서는 `python3 -m venv .venv`, `.venv/bin/python -m pip ...`, `.venv/bin/python -m uvicorn ...`, `npm ci`, `npm run dev`를 사용합니다.

`npm run dev`는 프론트엔드만 실행합니다. Python mock을 따로 실행해야 합니다. Vite가 `/api` 요청을 `127.0.0.1:8081`로 전달하므로 브라우저가 별도 서버에 직접 쿠키를 보내도록 CORS 설정을 변경할 필요가 없습니다.

## 가상 계정

비밀번호는 아래 계정 모두 `mock-pass-123`입니다. 역할을 실제 계정과 일치하게 선택합니다.

| 역할 | 아이디 | 확인할 내용 |
|---|---|---|
| 교사 | `t_math` | 수학 학생 수준·문항 현황·수학 원본 자료만 표시 |
| 교사 | `t_science` | 과학 담당 교사에게 과학 자료만 표시 |
| 학생 | `s_a` | 중국어 사용자, 진단 완료, 본인에게 배포된 자료·문항 |
| 학생 | `s_b` | 영역별 다양한 진단 결과, 미배포 자료 비노출 |
| 학생 | `s_pending` | 진단 미완료 안내, 학습 진입 차단 |
| 학생 | `s_new` | 클래스 미가입 안내 |

이름·클래스·학생 수·자료·진단·검토 대기 수는 서버 응답에서 읽습니다. 새로고침하면 `/auth/me`로 세션과 CSRF 토큰을 복원합니다. API mock은 메모리 저장 방식이므로 **서버를 재시작하면 로그인과 데이터 변경이 초기화됩니다.**

## API 연결

| 화면/행동 | API | 처리 |
|---|---|---|
| 로그인/세션/로그아웃 | `/api/v1/auth/login`, `/auth/me`, `/auth/logout` | HttpOnly 쿠키 + 쓰기 요청 CSRF |
| 클래스 선택 | `GET /api/v1/classes` | 서버가 허용한 멤버십 목록 |
| 교사 대시보드 | `GET /api/v1/classes/{id}/dashboard` | 담당 교과, 4수준+진단 미완료, 최초 정답 수와 현재 오답 분리 |
| 교사 원본 목록 | `GET /api/v1/classes/{id}/sources` | 원본 한 건당 카드 한 개, 자기 교과만 |
| 학생 대시보드 | `GET /api/v1/classes/{id}/dashboard?area=daily` | 공통 경로 사용, 선택한 영역의 듣기/읽기 수준 |

`src/api/wire.ts`는 서버 JSON 중 이 화면에서 사용하는 타입입니다. `src/api/adapters.ts`는 영어 enum 및 목록/집계 데이터를 화면용 타입으로 바꿉니다. 직접 JSON을 화면 타입으로 단언하지 않습니다. 전체 서버 명세는 `../api/openapi.json`, `../api/API_SPEC.md`를 참고하세요.

`src/api/transport.ts`는 다음 기능을 제공합니다.

- `request<T>`: JSON 반환. 204 응답은 `undefined` 처리.
- `requestWithMeta<T>`: `{data, status, headers, etag}` 반환. 향후 검토/배포 UI는 조회 ETag를 그대로 `If-Match`로 보냅니다.
- 사용자 헤더(`If-Match`, `Idempotency-Key`)와 CSRF 병합. FormData에는 Content-Type을 강제로 설정하지 않음.
- `ApiError.status/code/message/requestId`: 서버 오류를 화면에서 구분 가능.

API 키나 세션 토큰을 LocalStorage에 저장하지 않습니다. Solar 키를 `VITE_` 환경변수에 넣지 마세요. 이 프론트엔드는 실제 Solar 키를 받거나 사용하지 않습니다.

## 반영한 표시 규칙

- 진단은 초급 미달/초급/중급/고급. 미완료는 별도 상태입니다.
- 교사 진단은 자기 교과 기준이며, 학생은 생활한국어를 기본으로 영역을 바꿀 수 있습니다.
- 교사 최근 문제 풀이 분자는 `firstCorrectCount`. 재풀이 후 변하지 않습니다. `currentWrongCount`는 최신 제출을 반영합니다.
- 문항 제출 진행률은 제출한 문항 수/전체 문항 수입니다. 정답률과 다릅니다.
- ‘틀린 문항 수’와 ‘재풀이 횟수’를 혼용하지 않습니다.
- NEW는 최근 7일 배포 표시입니다. 읽음 여부나 마감일은 없습니다.
- 교사 자료 목록은 원본입니다. 학생별 전환본 목록을 원본 카드처럼 섞지 않습니다.

## 구현하지 않은 화면

클래스 개설·초대 수락·진단 문항·자료 업로드/생성/검토/배포·학생 자료 상세·문제 풀이/재풀이·학생 수준 상세·키 관리 등은 후속 작업입니다. 관련 버튼은 사유와 함께 비활성화했습니다. 검색·알림은 현재 제품 범위에 포함하지 않습니다.

기존 `#/teacher/dashboard` 등의 시연용 해시 전환은 제거했습니다. 로그인 역할과 메뉴로 화면을 선택합니다. 정식 URL 라우팅과 오류별 로그인 재진입 처리는 다음 화면 구현 시 보강해야 합니다.

## 확인 명령

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:hardcode
```

검증 결과: API adapter/HTTP client 9개 테스트 통과, TypeScript/Vite 빌드 통과, 하드코딩 검사 통과. 실제 DB/Solar나 모든 업무 흐름을 검증한 결과는 아닙니다.

원본 디자인 토큰(`tokens/`), 공통 컴포넌트, 로고를 유지했습니다. 원본 프론트엔드는 전체 묶음의 `frontend-original`에 별도로 보존했습니다. Figma 게시 명령은 실행하지 않았습니다.
