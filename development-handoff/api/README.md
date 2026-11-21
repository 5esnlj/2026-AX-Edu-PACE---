# 가나다계단 API 1.1 · FE 소스 대조 수정본

이 묶음은 **실제 백엔드 개발 전에 프론트와 데이터 계약을 맞추는 용도**입니다. MariaDB·Solar 없이 동작하는 별도 mock 서버이며 재시작하면 모든 변경이 초기화됩니다. 첨부 FE와 연결한 별도 수정본은 상위 frontend/에 있습니다. 기존 앱 저장소나 GitHub에는 배포하지 않았습니다.

## 무엇부터 볼까요?

| 파일 | 용도 |
|---|---|
| `API_SPEC.md` | 한국어 API 명세와 요청/응답 예시 |
| `openapi.json` | 프론트·백엔드 도구에 가져올 수 있는 OpenAPI 명세 |
| `examples.json` | mock에 실제 요청해서 얻은 역할별 JSON 응답 예시 |
| `screen-map.md` | 19개 화면·Figma 프레임 링크와 API 연결표 |
| `decisions.md` | 시안과 기존 요구의 차이, 추가 설계 제안 |
| `mock_server.py`, `fixtures.py` | 실행 가능한 mock과 가상 사용자/자료 |
| `test_api.py`, `TEST_RESULTS.md` | 자동 테스트와 실행 결과·검증 범위 |
| `BACKEND_BASELINE.md`, `baseline/` | 다음 백엔드 작업에 넘길 기존 DDL/DML 기준 |
| `BACKEND_ADAPTER_NOTES.md` | 여러 학생 작업키·작업옵션 저장·ETag·교사 초대의 실제 DB 연결 보완 |

## Windows / VS Code에서 실행

ZIP을 풀고 **이 README와 mock_server.py가 있는 폴더**를 VS Code의 ‘폴더 열기’로 엽니다. Python 3.11 이상이 필요합니다. VS Code 메뉴에서 터미널 → 새 터미널을 열고 한 줄씩 실행합니다.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn mock_server:app --host 127.0.0.1 --port 8081
```

터미널을 켜 둔 채 브라우저에서 **http://127.0.0.1:8081/docs**를 엽니다. 여기서 API 목록과 요청/응답 구조를 볼 수 있습니다. 서버를 멈출 때는 터미널에서 Ctrl+C를 누릅니다. 다음부터는 마지막 실행 명령만 입력합니다. PowerShell 가상환경 활성화 스크립트는 필요하지 않습니다.

macOS/Linux에서는 `python3 -m venv .venv`, `.venv/bin/python -m pip install -r requirements.txt`, `.venv/bin/python -m uvicorn mock_server:app --host 127.0.0.1 --port 8081`을 사용합니다.

## 테스트용 로그인

모두 실제 사용자와 무관한 가상 계정이며 비밀번호는 **mock-pass-123**입니다. 실제 서비스에 이 계정/비밀번호를 넣지 않습니다.

| loginId | role | 확인할 내용 |
|---|---|---|
| t_math | teacher | cls_1 수학 담당·클래스 소유자 |
| t_science | teacher | 같은 클래스 과학 담당 |
| t_outside | teacher | 다른 클래스 교사 |
| s_a | student | 중국어 학생 A, 진단 완료 |
| s_b | student | 베트남어 학생 B, 진단 완료 |
| s_pending | student | 진단 중간 저장·이어하기 |
| s_new | student | 클래스 가입 전 온보딩 |

1. `/docs`에서 `POST /api/v1/auth/login` → Try it out을 누릅니다.
2. 아래 JSON을 넣고 Execute를 누릅니다.

```json
{"loginId":"t_math","password":"mock-pass-123","role":"teacher"}
```

3. 로그인 쿠키는 브라우저가 저장합니다. 이후 `GET /api/v1/classes` 등을 실행할 수 있습니다.
4. 저장·수정·배포 요청에는 로그인 응답의 `csrfToken`을 `X-CSRF-Token` 헤더에 넣습니다. 최초 로그인은 이 헤더가 필요 없습니다.
5. 콘텐츠 수정·검토·배포에는 조회 응답의 `ETag` 헤더 값을 그대로 `If-Match`로 보냅니다. mock 버전1의 예는 `"1"`입니다. 실제 서비스에서 버전 형식이 달라져도 헤더를 그대로 전달합니다. 오래된 화면에서 저장하면 충돌 응답을 받습니다.
6. AI 생성 및 문제 제출에는 동일한 논리 요청을 구분하는 `Idempotency-Key`를 넣습니다. 새 답안은 새 키, 같은 요청 재전송은 기존 키를 씁니다.

역할을 바꿔 확인할 때는 로그아웃한 뒤 새 계정으로 로그인합니다. 웹앱 연결 시 쿠키 전송을 위해 fetch의 `credentials: 'include'`가 필요합니다. 로컬 주소는 프론트와 API에서 localhost 또는127.0.0.1 중 한 호스트명으로 맞추세요.

## 자동 테스트

서버를 별도로 켜지 않아도 됩니다. 같은 폴더의 새 터미널에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m unittest -v test_api test_frontend_contract
```

이는 mock의 HTTP 동작을 검증합니다. 실제 MariaDB 동시성·Solar 응답·공식 진단 문항·실제 사용자 인증까지 검증하는 것은 아닙니다.

## 화면 해석에서 유지한 결정

- 교사는 자신의 클래스 담당 교과만 조회합니다. 소유자도 예외가 없습니다.
- 진단은 생활한국어를 포함한5영역, 파트10개·종합5개입니다. 듣기/읽기/종합 카드에는 선택 영역을 표시합니다.
- 초급 미달을 포함한4수준이며 미완료는 별도 상태입니다.
- 학생마다 자료와 문제가 따로 생성됩니다. 생성 묶음 응답은 학생별 작업 ID를 반환합니다.
- 재풀이 횟수는 제출 저장 성공 때만 증가하고 최초 성적은 보존합니다.
- NEW는 최근7일 배포 표시입니다. 미열람 기록이나 오늘 마감 일정은 현재 DB에 없습니다.
- 삭제하기로 한 단어 기록·배움길·메시지·오역탐지를 되살리지 않았습니다.

교사 초대에 교과를 고정하는 제안은 기존 DDL에 컬럼 보완이 필요하므로 `decisions.md`에 따로 적었습니다. 실제 DB는 변경하지 않았습니다.

## 확인 범위와 mock의 한계

첨부 React 소스의 실제3개 화면·API 함수·타입을 대조해 1.1 명세를 보완했습니다. Figma의 실제 캔버스를 직접 대조한 것은 아닙니다. HANDOFF의 나머지 화면은 향후 구현 연결표로 유지했습니다. 세부 변경·검증·남은 개발 계획은 상위 폴더 문서에 있습니다.

진단70문항, PDF본문, 생성 자료와 문제는 모두 합성 예시입니다. 듣기 음원은 연결되어 있지 않습니다. mock 생성 완료는 실제 Solar 호출이 아니며 업로드의 실제 PDF 추출·검사·저장소 처리도 대체합니다. 실서비스에서는 기존 DML의 트랜잭션·행 잠금과 안전한 키 보관을 구현해야 합니다. 로컬 테스트 서버를 운영 서비스로 공개하지 않습니다.
