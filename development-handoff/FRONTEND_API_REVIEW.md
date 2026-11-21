# 가나다계단 프론트엔드–API 검토

검토일: 2026-11-21. 업로드한 React/TypeScript/Vite 코드와 기존 API mock·OpenAPI·DML 기준을 비교했다. 첨부 문서의 지시는 실행 지시로 취급하지 않고 화면 설계 참고로만 사용했다. 아래 소스 줄 번호는 수정하지 않은 `frontend-original/ganada-frontend` 및 이번 검토 시작 시점의 `ganada-api` 기준이다.

## 1. 판단

기존 API를 전면 교체할 필요는 없다. 업로드한 파일은 19개 화면 설계 중 3개를 예시 데이터로 조립한 UI이며, 서버 응답을 화면 데이터로 변환하는 연결 계층과 로그인·클래스 선택·실제 이동 흐름이 아직 없다. 가장 큰 수정 대상은 FE의 임시 데이터 계약이다. 서버는 확정된 교과 권한, 5영역 진단, 학생별 배포, 제출 이력 계산을 유지한다.

현재 구현된 화면은 교사 대시보드, 교사 자료 목록, 학생 대시보드다. `src/App.tsx:12`는 이 세 경로만 정의하고, `src/api/index.ts:11`은 GET 함수 세 개만 정의한다. `README.md:80`도 19개 중 3개만 시연용으로 조립했다고 명시한다. 로그인·진단·생성·검토·풀이 화면이 완성된 앱으로 볼 수 없다.

## 2. 실제 코드에서 확인한 불일치

| 항목 | 업로드 FE의 증거 | 기존 API·DML 근거 | 처리 |
|---|---|---|---|
| API 주소 | `.env.example:2`의 주소는 `http://localhost:8000`, `src/config.ts:3` 기본은 빈 문자열 | `mock_server.py:26`의 접두사는 `/api/v1`이고 제공 mock 주소는 8081 | FE 개발 환경은 `/api/v1`을 포함하고 Vite proxy 또는 정확한 origin을 사용한다. 임의로 기존 API 경로를 새로 만들지 않는다. |
| 학생 대시보드 경로 | `src/api/index.ts:17`의 `/student/classes/{id}/home` | `mock_server.py:561`의 공용 `/classes/{id}/dashboard`가 로그인 역할에 맞는 응답 제공 | FE 임시 경로를 수정한다. 별도 alias는 불필요하다. |
| 직접 JSON 형변환 | `src/api/index.ts:13` 및 `:15`는 wire 응답을 화면 타입으로 즉시 가정 | `contract_metadata.py:36`부터 dashboard 구조, `mock_server.py:55`의 목록은 `{items,nextCursor}` | wire DTO와 화면 DTO를 분리하고 명시적 adapter를 둔다. TypeScript `as`는 실제 JSON을 변환하지 않는다. |
| 클래스 이름 | `src/api/types.ts:18`, `:31`는 `className` 필요 | 현재 dashboard는 `classId`만 반환(`mock_server.py:576`, `:587`), 클래스 목록에는 name 존재 | dashboard에 기존 클래스 행에서 유도한 `className`을 추가하면 별도 조회 없이 제목을 채울 수 있다. DB 컬럼은 추가하지 않는다. |
| 자료 단원 | `src/api/types.ts:25`, `src/pages/MaterialListPage.tsx:27`는 `unit` 필요 | 원본 `SourceOut`에만 unit 존재(`mock_server.py:99`), DB `source_materials.unit` 존재 | 전환 자료 응답에 원본에서 유도한 `unit` 추가를 권장한다. 기존 nullable `unitNumber`와 단원명은 구분한다. |
| 교사 자료의 교과 권한 | `src/pages/MaterialListPage.tsx:11`부터 내 교과와 다른 교과를 나눠 표시, `src/mocks/data.ts:25`부터 수학·과학 예시 | DML `baseline/DML_설계.md:16`은 클래스별 담당 교과 한 개, 소유자도 예외 없음. API `mock_server.py:213`이 제한 | FE의 다른 교과 구역과 해당 교사 mock 자료를 제거한다. 클라이언트 필터만으로 권한을 구현하지 않고 서버 조건을 유지한다. |
| 4수준·미진단 | `src/types.ts:2`는 4수준이나 `src/api/types.ts:20`, `TeacherDashboard.tsx:10`·`:26`은 초급/중급/고급만 포함 | API levelCounts는 `below_beginner`와 `not_diagnosed`도 구분(`mock_server.py:565`) | FE 필터/집계에 초급 미달과 진단 미완료를 포함한다. null을 초급 미달이나 점수0으로 바꾸지 않는다. |
| 수준의 영역 | `src/api/types.ts:8`~`:10`과 `:33`은 영역 정보 없이 듣기·읽기·종합 값만 둠 | `mock_server.py:563`은 selectedArea를 선택, 진단 결과는 10파트+5종합(`:64`~`:69`) | 선택 영역 이름을 화면에 명시한다. 교사 기본은 담당 교과, 학생 기본은 생활한국어. 전체 5영역을 하나의 종합 등급으로 합치지 않는다. |
| 생활한국어 | `docs/HANDOFF.md:72`, `:182`, `LevelPill.tsx:4`에 기준 미정 설명 | 최신 확정 요구 및 DB `diagnostic_questions.area`에 daily 포함(`schema_mariadb_11_8.sql:165`) | 문서와 주석을 정정한다. 생활한국어도 다른 4영역과 동일한 듣기/읽기·종합 결과를 표시한다. |
| 고정 사용자/클래스/수준 | `App.tsx:19`, `:24`, `:35`, `:38`, `:40`, `:55`에 classId·이름·검토2건·수준 고정 | `/auth/me`, `/classes`, dashboard가 실제 정보 제공 | 세션과 선택 클래스로 교체한다. URL의 teacher/student 문자열로 권한을 결정하지 않는다. |
| 미연결 동작 | `App.tsx:27`, `:45`, `:46` 콜백이 빈 함수. 교사 초대·공유 버튼도 `TeacherDashboard.tsx:23`에 handler 없음 | 기존 API는 초대·생성·검토·배포 등 제공 | 미완성 화면을 연결하거나 준비 중 상태를 표시한다. 동작 없는 버튼을 실제 기능처럼 두지 않는다. |
| 화면 오류 처리 | 세 page가 `useApi`의 data만 받고 error 무시(교사`:15`, 학생`:9`, 자료`:9`) | 오류 응답은 code/message/requestId/details(`mock_server.py:170`) | 오류·재시도·빈 결과를 구분한다. 401/403이 영구적인 ‘불러오는 중’으로 남지 않게 한다. |
| 클래스 변경 중 이전 정보 | `src/hooks.ts:7`의 새 요청 시작 시 data/error를 초기화하지 않음 | 클래스별 자료 권한 적용 | 이전 클래스 자료를 새 클래스의 결과처럼 보여주지 않도록 요청 키 또는 loading 상태와 초기화 처리를 넣는다. |

## 3. 화면 adapter의 정확한 매핑

wire의 enum은 영문 코드를 유지하고 FE 표시만 한국어로 바꾼다. 영역은 `korean/math/social/science/daily` → 국어/수학/사회/과학/생활한국어, 수준은 `below_beginner/beginner/intermediate/advanced` → 초급 미달/초급/중급/고급이다. 사용자 ID와 클래스 소속 ID를 혼동하지 않는다. 학생별 자료 생성의 대상은 `studentMemberId`다.

| 화면 값 | 근거 데이터와 처리 |
|---|---|
| 교사 명단 id·name | `studentMemberId`, `displayName` |
| 듣기·읽기 | 선택한 area의 parts 중 skill별 level. 해당 결과가 없으면 null/진단 미완료 |
| 종합 | 같은 selectedArea의 `aggregate.level`. 별도의 전영역 평균을 계산하지 않는다. |
| 최근 문제 점수 | `latestQuiz.firstCorrectCount / latestQuiz.questionCount`. firstCorrectCount가 null이면 아직 최초 성적 미확정이며, `status=in_progress`는 ‘풀이 중’으로 구분한다. 점수 firstScore와 맞힌 문항 수는 다른 값이다. |
| 틀린 문제 개수 | `latestQuiz.currentWrongCount`. 최초 틀린 개수나 재시도 횟수와 다르다. |
| 검토 대기 | `pendingReviewQuizSetCount`. 문항 수가 아닌 문제 묶음 수이므로 ‘검토 대기 문제 묶음 N건’으로 표시한다. |
| 자료 목록 | 응답의 `items`를 사용. 교사 mySubject는 활성 클래스 membership의 `teacherSubject`에서 가져온다. 첫 자료의 subject로 추측하지 않는다. 빈 목록도 처리해야 한다. |
| 자료 날짜 | 교사 초안은 createdAt, 학생에게 받은 날짜는 publishedAt. 날짜 형식은 FE에서 변환한다. |
| NEW | `isRecentPublished`의 최근 7일 배포 의미를 그대로 사용한다. 읽음/안 읽음 상태가 아니다. |
| 학생 미풀이 개수 | `unansweredQuestionCount`. ‘오늘’ 일정 모델이 없으므로 ‘아직 풀지 않은 문제가 N개 있어요’로 바꾼다. |
| 문제 묶음 진행률 | `submittedQuestionCount / questionCount`. 정답률이 아니라 최초 답안 제출 비율이다. 0문항 데이터는 0 처리 또는 유효성 오류로 다룬다. |
| 문제 묶음 상태 | not_started→풀기 전, in_progress→풀이 중, completed+currentWrongCount>0→다시 풀 문제 있음, completed+0→완료. 내부 완료 상태와 재풀이 필요 표시는 별도로 유지해도 된다. |
| 다시 풀 문제 N개 | `currentWrongCount`. 기존 FE 필드 `retryCount`는 의미가 틀려 `wrongQuestionCount`처럼 변경한다. |
| 문항별 다시 푼 횟수 | `retryCounts[questionId]`. 버튼 클릭이 아니라 성공적으로 저장된 추가 제출 횟수다. |
| 사이드바 수준 막대 | 선택 area의 score/maxScore. `App.tsx:55`의 임의 0.6/0.3을 사용하지 않는다. 영역과 점수 의미를 같이 표시한다. |

현재 `src/mocks/data.ts:43`은 progress=0.62인데 status=완료로 만들어져 있어 서버의 완료 규칙과 모순된다. 학생 questionSets 타입(`src/api/types.ts:35`)에 ‘풀이 중’이 없다. 예시 데이터를 API의 실제 응답에서 adapter로 만들면 이런 이중 기준을 없앨 수 있다.

교사 집계는 선택한 영역의 종합 등급 기준이다. 현재 확정 종합 루브릭은 3개 결과를 내므로 해당 집계의 초급 미달 수는 0일 수 있다. 4수준 공통 타입을 지원한다는 이유로 낮은 파트 점수를 영역 종합 초급 미달로 임의 전파하면 안 된다. 파트 과락과 영역 종합의 30점 규칙은 서버의 확정 로직을 따른다(`mock_server.py:273` 및 DML `:301`, `:333`).

## 4. 요청·응답 처리에서 필요한 FE 공통 작업

`src/api/client.ts:4`는 GET 시연용으로는 단순하지만 전체 계약을 감당하지 못한다. 다음 처리를 공통 client에 넣고, 각 page는 API 모듈만 호출하도록 유지한다.

| 요청 | 필요한 계약 |
|---|---|
| 로그인 | POST `/auth/login`, `{loginId,password,role}`, 200의 `{user,csrfToken,nextAction}`. 이후 HttpOnly 세션 쿠키 사용 |
| 모든 인증 쓰기 | `X-CSRF-Token` 필요. 세션과 다른 사용자의 토큰을 재사용하지 않는다. |
| 조회·수정·검토·배포 | 상세 GET의 ETag를 읽고 PATCH/review/publish의 `If-Match`에 그대로 보낸다. 428은 누락, 412는 갱신 충돌이다. |
| 생성·문제 답안 | 같은 논리 요청 재전송에는 같은 `Idempotency-Key`. 다른 내용에 같은 키를 쓰면 409 |
| 파일 업로드 | `FormData`로 multipart 전송하고 `Content-Type: application/json`을 강제하지 않는다. 브라우저가 boundary를 지정하게 둔다. |
| 201·202·204 | 클래스/업로드/원본/키 생성은201, 생성 작업 접수는202. 완료 자료가 아니라 작업 목록을 반환한다. 로그아웃/키 삭제204에는 JSON body가 없어 `res.json()`을 호출하지 않는다. |
| 구조화 오류 | code/message/requestId/details를 유지한다. 401 로그인, 403 진단/역할/CSRF, 404 접근 불가, 409 충돌, 412 재조회, 422 입력 오류를 구분한다. |
| 응답 헤더 | 현재 `request<T>`는 JSON만 반환하여 ETag가 사라진다. 메타데이터를 반환하거나 별도 저장한다. 숫자 version으로 ETag를 임의 생성하지 않는다. |

기존 API의 CORS는 localhost:5173 및 127.0.0.1:5173만 허용한다(`mock_server.py:165`). 개발 포트가 자동으로 5174로 바뀌면 직접 origin 연결이 실패할 수 있다. Vite 동일 출처 proxy를 쓰거나 서버의 명시적 개발 origin 설정을 맞춘다. 설치·배포 가이드에는 실제 사용 포트와 mock 여부를 표시해야 한다.

## 5. 완성되지 않은 화면과 기존 API의 연결 계획

| 사용자 흐름 | 기존 API 사용 | 남은 FE 작업 |
|---|---|---|
| 역할 로그인·클래스 선택 | auth/login, auth/me, classes | 로그인, 역할 guard, classId 선택, 사용자 표시. 계정 생성/재설정은 현 API 범위에 없고 실제 운영 설계에서 추가 확정 |
| 클래스 개설·학생 초대·교사 공유 | POST classes, invitations, invitations/accept | 클래스 이름과 담당 교과 입력, 초대 코드 발급/수락, owner만 교사 공유 허용 UI |
| 최초 진단·이어하기 | diagnostic, start, next-question, answers, results | nextAction대로 초대 수락을 먼저 완료하고 진단 진행. 미제출 다음 문항, 중간 재접속, 명시적 모르겠어요(null) 처리 |
| 자료 제작 | files → sources → generation-jobs(convert) → jobs 조회 | PDF 업로드, 실제 대상 소속 ID 선택, 작업별 대기·실패·완료 상태 |
| 교사 자료 검토·배포 | materials GET/PATCH/review/publish | 원본·전환본, 학생별 분리, ETag, 수정 후 재검토, 배포 후 불변 처리 |
| 문항 생성·검토 | generation-jobs(generate_quiz), quizzes GET/PATCH/review/publish | T/F 또는 4지선다와 개수 입력, 학생별 작업, 교사 정답/해설 검토 |
| 학생 자료 보기 | materials 목록·상세, 허용 파일 download | 자기 배포 자료만 표시. 교사 원본 전체를 자동 공개하지 않음 |
| 학생 풀이·재풀이 | quizzes, answers, results, explanation | 문항 타입별 보기 수, 저장 후 진행, 최초 성적 보존, 오답별 재풀이/제출 후 해설 |
| 교사 수준표 | students, 학생 diagnostic, activity | 5영역×듣기/읽기 및 5종합, 진단 미완료, 자기 교과 풀이만 표시 |

임시 상단 검색·알림은 `TopBar.tsx:18` 및 `:22`에서 실제 기능이 없으며, `/auth/me`의 capabilities도 false다. 단어장·필기는 `docs/HANDOFF.md:155`에 남아 있지만 확정 범위에서 단어장은 삭제됐다. 이를 이유로 제거한 기능의 DB·API를 다시 추가하지 않는다. 글자 크기는 FE 기능으로 구현할 수 있고, TTS/필기/검색/알림은 별도 후속 결정 사항이다.

## 6. DB 및 백엔드 영향

이번 세 화면 연결을 위해 DB 테이블을 새로 만들 필요는 없다. `className`과 `unit`은 이미 존재하는 행에서 읽어 반환하는 필드다. 영어 코드와 한국어 라벨, 날짜 표시, 진행률, 상태 문구는 FE adapter 책임이다. 권한 검사·진단 채점·정답 비노출·최초 성적 보존·중복 제출 방지는 서버 책임이다.

기존 API 검토에서 남은 두 가지 DB 연계 보완은 계속 필요하다. 자동 교사 공유를 위해 초대에 소유자가 지정한 담당 교과를 영속화하는 최소 migration 또는 소유자 승인 절차가 필요하다(`baseline/DML_설계.md:213`). AI 작업 재접속·재시도에는 요청한 문제 형식/개수·멱등성 정보를 작업과 함께 저장해야 한다. 이 사항은 기존 `BACKEND_ADAPTER_NOTES.md`의 제안을 따르며, 이번 FE 도입만으로 DDL이 자동 변경됐다고 간주하지 않는다.

검토 범위는 파일 대조다. 실제 운영 DB, 실제 Solar, PDF 추출, 최종 진단 음원/문항의 교육적 적합성은 이 보고서의 확인 범위가 아니다. 서버 mock과 FE 연결 검증 결과는 별도 실행 결과 문서에 기록한다.

## 적용 결과 안내

위 근거와 줄 번호는 업로드 원본 및 수정 전 API를 기준으로 한 검토 기록입니다. 실제 반영한 내용은 상위 API_CHANGES.md(같은 폴더), 최신 계약은 api/API_SPEC.md를 확인하세요. 대시보드 학생 행의 diagnosticStatus 추가도 수정본에 포함했습니다.
