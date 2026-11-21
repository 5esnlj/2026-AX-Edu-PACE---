# 가나다계단 API 명세 초안

버전: 1.1.0 · 기준일 2026-11-21 · 실제 React FE 검토 반영 / MariaDB DML 기반 mock

**이 문서는 mock 서버의 OpenAPI와 실제 HTTP 응답 예시에서 생성했습니다.** 실제 DB·Solar를 사용하는 운영 백엔드는 아직 구현하지 않았습니다. 이번 1.1판은 첨부 React + TypeScript + Vite 소스의 실제 3개 화면과 기존 HANDOFF의19개 화면 설명을 대조했습니다. Figma 캔버스 자체를 직접 열어 시각적으로 비교한 것은 아닙니다. 수정된 FE 연결본과 변경 요약은 상위 폴더의 frontend/ 및 API_CHANGES.md를 참고하세요.

## 읽는 순서

상위 폴더 API_CHANGES.md에서 1.1 변경을 확인한 뒤 screen-map.md에서 화면을 찾고 아래 메서드/경로를 확인합니다. 요청 DTO 필드는 뒤의 스키마 목록에서, 실제 응답 예시는 examples.json과 이 문서 마지막에서 확인합니다. OpenAPI 전체 구조는 openapi.json을 사용합니다.

## 공통 계약

- 기본 주소: `http://127.0.0.1:8081/api/v1`. `/docs`는 Swagger UI, `/openapi.json`은 기계가 읽는 명세입니다.
- JSON camelCase. ID는 문자열입니다. mock ID는 읽기 쉬운 접두어이며 실제 DB BIGINT도 응답에서는 문자열로 직렬화합니다.
- 단건은 객체, 목록은 `{items: [...], nextCursor: null}`입니다. mock은 작은 고정목록 전체 반환이며 실제 대용량 운영에서는 cursor 페이지네이션을 구현해야 합니다.
- 로그인 역할 탭은 실제 계정 역할과 일치해야 합니다. 인증은 HttpOnly 세션 쿠키입니다.
- 로그인 응답의 csrfToken을 인증된 쓰기 요청의 X-CSRF-Token 헤더에 넣습니다. 생성/답안에는 Idempotency-Key, 수정/검토/배포에는 If-Match 버전이 필요합니다.
- 원본·전환본·문제·파일·풀이 직접 접근에도 교사 클래스+교과 제한/학생 본인배정+배포조건을 적용합니다. UI에서 숨기는 것으로 대체하지 않습니다.
- 진단 미완료 학생은 클래스가입/진단 외 학습 흐름으로 넘어가지 않습니다. 진단은 계정당1회, 완료결과는 파트10개·영역종합5개입니다.
- 공개된 문항의 정답/해설은 학생의 첫 제출 전 응답에 포함하지 않습니다. 교사 검토용 응답과 구분합니다.
- 상태·오류·숫자의 의미 및 UI와의 차이는 decisions.md에 기록했습니다. actual mock limitations는 README에 기록했습니다.

| HTTP | 의미 |
|---|---|
| 200 / 201 / 202 / 204 | 조회·처리 성공 / 생성 / 생성작업 접수 / 응답 본문 없는 성공 |
| 401 | 로그인 없음·만료·잘못된 로그인 |
| 403 / 404 | 역할·CSRF 등 거절 / 없거나 현재 사용자가 접근할 수 없는 리소스 |
| 409 | 순서·상태·중복키의 다른내용·완료된진단·정답후재풀이 등 충돌 |
| 412 / 428 | 오래된 버전 / 필요한 If-Match 없음 |
| 413 / 415 / 422 | 파일크기 / 파일형식 / 요청값 검증 실패 |

오류는 `{code, message, requestId, details}`입니다. 같은 멱등키로 다른 내용을 보내면 기존 성공 응답을 반환하지 않고 충돌 처리합니다. 수정 이후에는 새 버전을 다시 읽습니다.

## 엔드포인트 목록

| 메서드 | 경로 | 동작 | 요청 본문 | 정상응답 / 응답 DTO |
|---|---|---|---|---|
| GET | `/api/v1/health` | mock 실행 상태 | 없음 | 200 HealthOut |
| POST | `/api/v1/auth/login` | 역할을 확인한 로그인 | Login | 200 SessionOut |
| GET | `/api/v1/auth/me` | 현재 사용자·다음 이동·지원 기능 | 없음 | 200 SessionOut |
| POST | `/api/v1/auth/logout` | 로그아웃 | 없음 | 204 object |
| GET | `/api/v1/classes` | 내 클래스 목록 | 없음 | 200 ClassList |
| POST | `/api/v1/classes` | 교사의 클래스 개설 | ClassCreate | 201 ClassOut |
| POST | `/api/v1/classes/{classId}/invitations` | 교사 공유·학생 초대 발급 | InviteCreate | 201 InviteOut |
| POST | `/api/v1/invitations/accept` | 초대 수락 | AcceptInvite | 200 InviteAcceptedOut |
| GET | `/api/v1/diagnostic` | 최초 진단 진행 상태 | 없음 | 200 DiagnosticStatus |
| POST | `/api/v1/diagnostic/start` | 최초 진단 시작 또는 기존 상태 반환 | DiagnosticStart | 200 DiagnosticStatus |
| GET | `/api/v1/diagnostic/next-question` | 다음 미제출 진단 문항 | 없음 | 200 DiagnosticNext |
| POST | `/api/v1/diagnostic/answers` | 진단 답안 저장·완료 채점 | DiagnosticAnswer | 200 DiagnosticAnswerOut |
| GET | `/api/v1/diagnostic/results` | 본인 진단10파트·5종합 결과 | 없음 | 200 DiagnosticResults |
| GET | `/api/v1/classes/{classId}/students` | 학생 목록과 전체영역 수준표 | 없음 | 200 StudentList |
| GET | `/api/v1/classes/{classId}/students/{memberId}/diagnostic` | 교사의 개별 학생 진단 상세 | 없음 | 200 StudentDiagnosticOut |
| POST | `/api/v1/classes/{classId}/files` | 교사 PDF 업로드 mock | Body_upload_file_api_v1_classes__classId__files_post | 201 UploadOut |
| POST | `/api/v1/classes/{classId}/sources` | 자기 교과 원본 등록 | SourceCreate | 201 SourceOut |
| GET | `/api/v1/classes/{classId}/sources` | 자기 교과 원본 목록 | 없음 | 200 SourceList |
| GET | `/api/v1/sources/{sourceId}` | 교사 원본 상세 | 없음 | 200 SourceOut |
| GET | `/api/v1/files/{fileId}/download` | 권한 확인 후 가상 PDF 다운로드 | 없음 | 200 object |
| POST | `/api/v1/classes/{classId}/generation-jobs` | 학생별 AI 생성 작업 접수 mock | Generate | 202 JobList |
| GET | `/api/v1/generation-jobs/{jobId}` | 내 생성 작업 상태·결과 | 없음 | 200 JobOut |
| GET | `/api/v1/classes/{classId}/materials` | 역할별 허용 전환본 목록 | 없음 | 200 MaterialList |
| GET | `/api/v1/materials/{materialId}` | 역할별 허용 전환본 상세 | 없음 | 200 MaterialOut |
| PATCH | `/api/v1/materials/{materialId}` | 초안 수정·검토 해제 | MaterialPatch | 200 MaterialOut |
| POST | `/api/v1/materials/{materialId}/review` | 전환본 검토 완료 | 없음 | 200 MaterialOut |
| POST | `/api/v1/materials/{materialId}/publish` | 학생별 전환본 배포 | 없음 | 200 MaterialOut |
| GET | `/api/v1/classes/{classId}/quizzes` | 역할별 허용 문제 묶음 목록 | 없음 | 200 QuizList |
| GET | `/api/v1/quizzes/{quizId}` | 문제 상세·학생 정답 제외 | 없음 | 200 QuizOut |
| PATCH | `/api/v1/quizzes/{quizId}/questions/{questionId}` | 문항·정답·해설 수정 | QuestionPatch | 200 QuizOut |
| POST | `/api/v1/quizzes/{quizId}/review` | 문제 묶음 검토 완료 | 없음 | 200 QuizOut |
| POST | `/api/v1/quizzes/{quizId}/publish` | 학생별 문제 묶음 배포 | 없음 | 200 QuizOut |
| POST | `/api/v1/quizzes/{quizId}/answers` | 최초 답안 또는 오답 재풀이 제출 | QuizAnswer | 200 AnswerOut |
| GET | `/api/v1/quizzes/{quizId}/results` | 최초 성적·현재 정오·재풀이 수 | 없음 | 200 ScoreResults |
| GET | `/api/v1/quizzes/{quizId}/questions/{questionId}/explanation` | 제출 이후 문항 해설 | 없음 | 200 ExplanationOut |
| GET | `/api/v1/classes/{classId}/activity` | 교사 자기 교과 최근 배포·풀이 | 없음 | 200 ActivityList |
| GET | `/api/v1/classes/{classId}/dashboard` | 교사·학생 대시보드 | 없음 | 200 object |
| GET | `/api/v1/ai-credentials` | 본인 Solar 연결 목록·마스킹 | 없음 | 200 CredentialList |
| POST | `/api/v1/ai-credentials` | 가상 키 등록 mock | CredentialCreate | 201 CredentialOut |
| POST | `/api/v1/ai-credentials/{credentialId}/check` | 가상 연결 확인 mock | 없음 | 200 CredentialOut |
| DELETE | `/api/v1/ai-credentials/{credentialId}` | 본인 연결 해제 | 없음 | 204 object |

엔드포인트 총 41개. 로그인·자료 업로드·진단·생성·검토·배포·풀이를 포함합니다.

## 경로·쿼리·헤더 매개변수

### POST /api/v1/auth/logout

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/classes

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/classes/{classId}/invitations

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/invitations/accept

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/diagnostic/start

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/diagnostic/answers

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### GET /api/v1/classes/{classId}/students

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |

### GET /api/v1/classes/{classId}/students/{memberId}/diagnostic

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `memberId` | path | 예 | string  |

### POST /api/v1/classes/{classId}/files

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/classes/{classId}/sources

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### GET /api/v1/classes/{classId}/sources

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `subject` | query | 아니오 | enum: korean, math, social, science, daily / null  |

### GET /api/v1/sources/{sourceId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `sourceId` | path | 예 | string  |

### GET /api/v1/files/{fileId}/download

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `fileId` | path | 예 | string  |

### POST /api/v1/classes/{classId}/generation-jobs

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `Idempotency-Key` | header | 예 | string 논리 요청 식별자. 같은 내용 재전송에 같은 키, 다른 내용 재사용은409. |

### GET /api/v1/generation-jobs/{jobId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `jobId` | path | 예 | string  |

### GET /api/v1/classes/{classId}/materials

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `subject` | query | 아니오 | enum: korean, math, social, science, daily / null  |

### GET /api/v1/materials/{materialId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `materialId` | path | 예 | string  |

### PATCH /api/v1/materials/{materialId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `materialId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `If-Match` | header | 예 | string 조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412. |

### POST /api/v1/materials/{materialId}/review

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `materialId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `If-Match` | header | 예 | string 조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412. |

### POST /api/v1/materials/{materialId}/publish

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `materialId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `If-Match` | header | 예 | string 조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412. |

### GET /api/v1/classes/{classId}/quizzes

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `subject` | query | 아니오 | enum: korean, math, social, science, daily / null  |

### GET /api/v1/quizzes/{quizId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |

### PATCH /api/v1/quizzes/{quizId}/questions/{questionId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |
| `questionId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `If-Match` | header | 예 | string 조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412. |

### POST /api/v1/quizzes/{quizId}/review

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `If-Match` | header | 예 | string 조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412. |

### POST /api/v1/quizzes/{quizId}/publish

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `If-Match` | header | 예 | string 조회 응답의 ETag를 그대로 전달. 예: "1". 누락428, 오래된값412. |

### POST /api/v1/quizzes/{quizId}/answers

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |
| `Idempotency-Key` | header | 예 | string 논리 요청 식별자. 같은 내용 재전송에 같은 키, 다른 내용 재사용은409. |

### GET /api/v1/quizzes/{quizId}/results

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |

### GET /api/v1/quizzes/{quizId}/questions/{questionId}/explanation

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `quizId` | path | 예 | string  |
| `questionId` | path | 예 | string  |

### GET /api/v1/classes/{classId}/activity

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |

### GET /api/v1/classes/{classId}/dashboard

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `classId` | path | 예 | string  |
| `area` | query | 아니오 | enum: korean, math, social, science, daily / null  |

### POST /api/v1/ai-credentials

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### POST /api/v1/ai-credentials/{credentialId}/check

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `credentialId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

### DELETE /api/v1/ai-credentials/{credentialId}

| 이름 | 위치 | 필수 | 형식 / 설명 |
|---|---|---|---|
| `credentialId` | path | 예 | string  |
| `X-CSRF-Token` | header | 예 | string 로그인 응답의 csrfToken. 인증된 쓰기 요청에 필요. |

## 요청과 응답 스키마

### AcceptInvite

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `code` | string | 예 |  |

### AnswerOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `questionId` | string | 예 |  |
| `attemptNo` | integer | 예 |  |
| `isCorrect` | boolean | 예 |  |
| `points` | number | 예 |  |
| `retryCount` | integer | 예 |  |
| `replayed` | boolean | 예 |  |
| `results` | ScoreResults | 예 |  |

### AreaResult

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `area` | enum: korean, math, social, science, daily | 예 |  |
| `score` | number | 예 |  |
| `maxScore` | integer | 아니오 |  기본값: 200 |
| `level` | enum: below_beginner, beginner, intermediate, advanced | 예 |  |

### Body_upload_file_api_v1_classes__classId__files_post

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `file` | string | 예 |  |

### ClassCreate

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `name` | string | 예 |  |
| `gradeLabel` | string | 아니오 |  기본값: "중1" |
| `academicYear` | integer | 아니오 |  기본값: 2026 |
| `teacherSubject` | enum: korean, math, social, science, daily | 예 |  |

### ClassList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<ClassOut> | 예 |  |
| `nextCursor` | string / null | 아니오 |  |

### ClassOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `name` | string | 예 |  |
| `gradeLabel` | string | 예 |  |
| `academicYear` | integer | 예 |  |
| `ownerId` | string | 예 |  |
| `status` | string | 예 |  |
| `membershipId` | string / null | 아니오 |  |
| `teacherSubject` | enum: korean, math, social, science, daily / null | 아니오 |  |

### Content

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `paragraphs` | array<Paragraph> | 예 |  |
| `translations` | array<object> | 아니오 |  |

### CredentialCreate

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `label` | string | 아니오 |  기본값: "가상 Solar 연결" |
| `apiKey` | string | 예 |  |

### CredentialList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<CredentialOut> | 예 |  |
| `nextCursor` | string / null | 아니오 |  |

### CredentialOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `teacherId` | string | 예 |  |
| `label` | string | 예 |  |
| `maskedSuffix` | string | 예 |  |
| `status` | string | 예 |  |
| `provider` | string | 예 |  |
| `isMock` | boolean | 예 |  |

### DiagnosticAnswer

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `questionId` | string | 예 |  |
| `selectedOptionId` | string / null | 예 |  |

### DiagnosticNext

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `progress` | DiagnosticStatus | 예 |  |
| `question` | DiagnosticQuestion / null | 예 |  |

### DiagnosticQuestion

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `sequence` | integer | 예 |  |
| `area` | enum: korean, math, social, science, daily | 예 |  |
| `skill` | enum: listening, reading | 예 |  |
| `prompt` | string | 예 |  |
| `options` | array<Option> | 예 |  |
| `audioUrl` | string / null | 예 |  |
| `stimulusText` | string | 예 |  |
| `isSynthetic` | boolean | 예 |  |

### DiagnosticResults

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `formId` | string | 예 |  |
| `isSynthetic` | boolean | 예 |  |
| `parts` | array<PartResult> | 예 |  |
| `areas` | array<AreaResult> | 예 |  |

### DiagnosticStart

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `classId` | string | 예 |  |

### DiagnosticStatus

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `status` | enum: not_started, in_progress, completed | 예 |  |
| `formId` | string / null | 예 |  |
| `totalQuestions` | integer | 예 |  |
| `completedQuestions` | integer | 예 |  |
| `nextQuestionId` | string / null | 예 |  |

### ErrorOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `code` | string | 예 |  |
| `message` | string | 예 |  |
| `requestId` | string | 예 |  |
| `details` | object | 아니오 |  |

### Generate

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `sourceId` | string | 예 |  |
| `studentMemberIds` | array<string> | 예 |  |
| `operation` | enum: convert, generate_quiz | 예 |  |
| `inputMaterialId` | string / null | 아니오 |  |
| `questionType` | enum: true_false, multiple_choice_4 / null | 아니오 |  |
| `questionCount` | integer / null | 아니오 |  |

### InviteCreate

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `invitedRole` | enum: teacher, student | 예 |  |
| `teacherSubject` | enum: korean, math, social, science, daily / null | 아니오 |  |
| `maxUses` | integer | 아니오 |  기본값: 1 |
| `expiresInHours` | integer | 아니오 |  기본값: 24 |

### JobList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<JobOut> | 예 |  |
| `nextCursor` | string / null | 아니오 |  |

### JobOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `sourceId` | string | 예 |  |
| `studentMemberId` | string | 예 |  |
| `credentialId` | string | 예 |  |
| `operation` | enum: convert, generate_quiz | 예 |  |
| `status` | enum: queued, running, succeeded, failed, unknown | 예 |  |
| `resultId` | string / null | 예 |  |
| `resultType` | string / null | 예 |  |

### Login

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `loginId` | string | 예 |  |
| `password` | string | 예 |  |
| `role` | enum: teacher, student | 예 |  |

### MaterialList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<MaterialOut> | 예 |  |
| `nextCursor` | string / null | 아니오 |  |

### MaterialOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `sourceId` | string | 예 |  |
| `studentMemberId` | string | 예 |  |
| `subject` | enum: korean, math, social, science, daily | 예 |  |
| `title` | string | 예 |  |
| `unit` | string | 예 |  |
| `status` | enum: draft, reviewed, published, withdrawn | 예 |  |
| `version` | integer | 예 |  |
| `revision` | integer | 예 |  |
| `content` | object | 예 |  |
| `createdAt` | string | 예 |  |
| `publishedAt` | string / null | 예 |  |
| `reviewedAt` | string / null | 예 |  |
| `isRecentPublished` | boolean | 아니오 |  기본값: false |
| `unitNumber` | string / null | 아니오 |  |
| `thumbnailUrl` | string / null | 아니오 |  |
| `originalContent` | string / null | 아니오 |  |

### MaterialPatch

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `content` | Content | 예 |  |

### Option

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `text` | string | 예 |  |

### Paragraph

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `text` | string | 예 |  |

### PartResult

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `area` | enum: korean, math, social, science, daily | 예 |  |
| `skill` | enum: listening, reading | 예 |  |
| `score` | number | 예 |  |
| `maxScore` | integer | 아니오 |  기본값: 100 |
| `level` | enum: below_beginner, beginner, intermediate, advanced | 예 |  |

### QuestionOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `position` | integer | 예 |  |
| `questionType` | enum: true_false, multiple_choice_4 | 예 |  |
| `prompt` | string | 예 |  |
| `choices` | array<Option> | 예 |  |
| `maxPoints` | number | 예 |  |
| `correctOptionId` | string / null | 아니오 |  |
| `explanation` | string / null | 아니오 |  |
| `sourceSentenceIds` | array<string> / null | 아니오 |  |

### QuestionPatch

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `prompt` | string | 예 |  |
| `choices` | array<Option> | 예 |  |
| `correctOptionId` | string | 예 |  |
| `explanation` | string | 예 |  |
| `sourceSentenceIds` | array<string> | 예 |  |
| `maxPoints` | number | 아니오 |  기본값: 1 |

### QuizAnswer

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `questionId` | string | 예 |  |
| `selectedOptionId` | string | 예 |  |

### QuizList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<QuizOut> | 예 |  |
| `nextCursor` | string / null | 아니오 |  |

### QuizOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `sourceId` | string | 예 |  |
| `studentMemberId` | string | 예 |  |
| `subject` | enum: korean, math, social, science, daily | 예 |  |
| `title` | string | 예 |  |
| `status` | enum: draft, reviewed, published, withdrawn | 예 |  |
| `version` | integer | 예 |  |
| `questionType` | enum: true_false, multiple_choice_4 | 예 |  |
| `questions` | array<QuestionOut> | 예 |  |
| `questionCount` | integer | 예 |  |
| `publishedAt` | string / null | 아니오 |  |
| `progress` | ScoreResults / null | 아니오 |  |
| `passage` | object / null | 아니오 |  |

### ScoreResults

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `quizId` | string | 예 |  |
| `questionCount` | integer | 예 |  |
| `submittedQuestionCount` | integer | 예 |  |
| `status` | enum: not_started, in_progress, completed | 예 |  |
| `firstScore` | number / null | 예 |  |
| `maxScore` | number | 예 |  |
| `firstCorrectCount` | integer / null | 예 |  |
| `latestCorrectCount` | integer | 예 |  |
| `currentWrongCount` | integer | 예 |  |
| `unansweredQuestionCount` | integer | 예 |  |
| `retryCounts` | object | 예 |  |
| `wrongQuestions` | array<object> | 예 |  |

### SessionOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `user` | UserOut | 예 |  |
| `csrfToken` | string | 예 |  |
| `nextAction` | enum: classes, diagnostic, join_class | 예 |  |

### SourceCreate

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `fileId` | string | 예 |  |
| `title` | string | 예 |  |
| `unit` | string | 아니오 |  기본값: "" |

### SourceList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<SourceOut> | 예 |  |
| `nextCursor` | string / null | 아니오 |  |

### SourceOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `createdBy` | string | 예 |  |
| `fileId` | string | 예 |  |
| `title` | string | 예 |  |
| `subject` | enum: korean, math, social, science, daily | 예 |  |
| `unit` | string | 예 |  |
| `unitNumber` | string / null | 예 |  |
| `thumbnailUrl` | string / null | 예 |  |
| `sourceText` | string | 예 |  |
| `sentences` | array<object> | 예 |  |
| `createdAt` | string | 예 |  |

### UserOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `loginId` | string | 예 |  |
| `role` | enum: teacher, student | 예 |  |
| `displayName` | string | 예 |  |
| `nativeLanguage` | string | 예 |  |

### HealthOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `status` | string | 예 |  |
| `mode` | string | 예 |  |
| `databaseConnected` | boolean | 예 |  |
| `solarConnected` | boolean | 예 |  |
| `isSynthetic` | boolean | 예 |  |

### MembershipOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `userId` | string | 예 |  |
| `role` | RoleCode | 예 |  |
| `teacherSubject` | AreaCode / null | 예 |  |
| `status` | string | 예 |  |

### RoleCode

['teacher', 'student']

### AreaCode

['korean', 'math', 'social', 'science', 'daily']

### DiagnosticStateCode

['not_started', 'in_progress', 'completed']

### InviteOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `createdBy` | string | 예 |  |
| `code` | string | 예 |  |
| `invitedRole` | RoleCode | 예 |  |
| `teacherSubject` | AreaCode / null | 예 |  |
| `maxUses` | integer | 예 |  |
| `usedCount` | integer | 예 |  |
| `expiresAt` | string | 예 |  |
| `revoked` | boolean | 예 |  |

### InviteAcceptedOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `membership` | MembershipOut | 예 |  |
| `alreadyMember` | boolean | 예 |  |
| `nextAction` | string | 예 |  |

### DiagnosticAnswerOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `progress` | DiagnosticStatus | 예 |  |
| `replayed` | boolean | 예 |  |

### StudentRow

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `userId` | string | 예 |  |
| `displayName` | string | 예 |  |
| `nativeLanguage` | string | 예 |  |
| `diagnosticStatus` | DiagnosticStateCode | 예 |  |
| `partResults` | array<PartResult> | 예 |  |
| `areaResults` | array<AreaResult> | 예 |  |

### StudentList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<StudentRow> | 예 |  |
| `nextCursor` | string / null | 예 |  |

### StudentDiagnosticOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `studentMemberId` | string | 예 |  |
| `status` | DiagnosticStateCode | 예 |  |
| `results` | DiagnosticResults / null | 예 |  |

### UploadOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `classId` | string | 예 |  |
| `createdBy` | string | 예 |  |
| `subject` | AreaCode | 예 |  |
| `name` | string | 예 |  |
| `size` | integer | 예 |  |
| `mimeType` | string | 예 |  |
| `isSynthetic` | boolean | 예 |  |
| `extractionStatus` | string | 예 |  |
| `notice` | string | 예 |  |

### ExplanationOut

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `questionId` | string | 예 |  |
| `correctOptionId` | string | 예 |  |
| `explanation` | string | 예 |  |

### ActivityRow

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `quizId` | string | 예 |  |
| `title` | string | 예 |  |
| `studentMemberId` | string | 예 |  |
| `publishedAt` | string | 예 |  |
| `lastAnsweredAt` | string / null | 예 |  |
| `results` | ScoreResults | 예 |  |

### ActivityList

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `items` | array<ActivityRow> | 예 |  |
| `nextCursor` | string / null | 예 |  |

### DashboardStudentRow

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `studentMemberId` | string | 예 |  |
| `displayName` | string | 예 |  |
| `nativeLanguage` | string | 예 |  |
| `diagnosticStatus` | DiagnosticStateCode | 예 |  |
| `selectedArea` | AreaCode | 예 |  |
| `parts` | array<PartResult> | 예 |  |
| `aggregate` | AreaResult / null | 예 |  |
| `latestQuiz` | ScoreResults / null | 예 |  |

### TeacherDashboard

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `classId` | string | 예 |  |
| `className` | string | 예 |  |
| `selectedArea` | AreaCode | 예 |  |
| `teacherSubject` | AreaCode | 예 |  |
| `studentCount` | integer | 예 |  |
| `levelCounts` | object | 예 |  |
| `pendingReviewQuizSetCount` | integer | 예 |  |
| `students` | array<DashboardStudentRow> | 예 |  |

### StudentDashboardQuiz

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `id` | string | 예 |  |
| `title` | string | 예 |  |
| `subject` | AreaCode | 예 |  |
| `progress` | ScoreResults | 예 |  |

### StudentDashboard

| 필드 | 형식 | 필수 | 설명/기본값 |
|---|---|---|---|
| `classId` | string | 예 |  |
| `className` | string | 예 |  |
| `displayName` | string | 예 |  |
| `selectedArea` | AreaCode | 예 |  |
| `parts` | array<PartResult> | 예 |  |
| `aggregate` | AreaResult | 예 |  |
| `unansweredQuestionCount` | integer | 예 |  |
| `retryQuestionCount` | integer | 예 |  |
| `assignedQuizSetCount` | integer | 예 |  |
| `newMaterials` | array<MaterialOut> | 예 |  |
| `quizzes` | array<StudentDashboardQuiz> | 예 |  |

## 실제 mock 요청·응답 예시

모두 가상 데이터입니다. csrfToken은 전달용 문서에서 대체 표시했습니다. 전체 예시는 examples.json을 참고합니다.

### 로그인 t_math

`POST /api/v1/auth/login` → 200

요청:
```json
{
  "loginId": "t_math",
  "password": "mock-pass-123",
  "role": "teacher"
}
```

응답:
```json
{
  "user": {
    "id": "usr_t_math",
    "loginId": "t_math",
    "role": "teacher",
    "displayName": "t_math (가상)",
    "nativeLanguage": "ko"
  },
  "csrfToken": "CSRF_TOKEN_FROM_LOGIN_RESPONSE",
  "nextAction": "classes"
}
```

### 기능 지원 여부

`GET /api/v1/auth/me` → 200

응답:
```json
{
  "user": {
    "id": "usr_t_math",
    "loginId": "t_math",
    "role": "teacher",
    "displayName": "t_math (가상)",
    "nativeLanguage": "ko"
  },
  "csrfToken": "CSRF_TOKEN_FROM_LOGIN_RESPONSE",
  "nextAction": "classes",
  "capabilities": {
    "search": false,
    "notifications": false,
    "vocabulary": false,
    "notes": false,
    "tts": false
  }
}
```

### 교사 클래스 목록

`GET /api/v1/classes` → 200

응답:
```json
{
  "items": [
    {
      "id": "cls_1",
      "name": "가상 3학년 2반",
      "gradeLabel": "중3",
      "academicYear": 2026,
      "ownerId": "usr_t_math",
      "status": "active",
      "membershipId": "mem_t_math",
      "teacherSubject": "math"
    }
  ],
  "nextCursor": null
}
```

### 교사 대시보드 수학

`GET /api/v1/classes/cls_1/dashboard?area=math` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "selectedArea": "math",
  "teacherSubject": "math",
  "studentCount": 3,
  "levelCounts": {
    "below_beginner": 0,
    "beginner": 0,
    "intermediate": 1,
    "advanced": 1,
    "not_diagnosed": 1
  },
  "pendingReviewQuizSetCount": 1,
  "students": [
    {
      "studentMemberId": "mem_s_a",
      "displayName": "학생 A (가상)",
      "nativeLanguage": "zh",
      "diagnosticStatus": "completed",
      "selectedArea": "math",
      "parts": [
        {
          "area": "math",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        }
      ],
      "aggregate": {
        "area": "math",
        "score": 200,
        "maxScore": 200,
        "level": "advanced"
      },
      "latestQuiz": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 0,
        "status": "not_started",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 3,
        "retryCounts": {
          "quiz_a_math_1_q1": 0,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": []
      }
    },
    {
      "studentMemberId": "mem_s_b",
      "displayName": "학생 B (가상)",
      "nativeLanguage": "vi",
      "diagnosticStatus": "completed",
      "selectedArea": "math",
      "parts": [
        {
          "area": "math",
          "skill": "listening",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        }
      ],
      "aggregate": {
        "area": "math",
        "score": 80,
        "maxScore": 200,
        "level": "intermediate"
      },
      "latestQuiz": null
    },
    {
      "studentMemberId": "mem_s_pending",
      "displayName": "s_pending (가상)",
      "nativeLanguage": "mn",
      "diagnosticStatus": "in_progress",
      "selectedArea": "math",
      "parts": [],
      "aggregate": null,
      "latestQuiz": null
    }
  ]
}
```

### 교사 학생 수준표 5영역

`GET /api/v1/classes/cls_1/students` → 200

응답:
```json
{
  "items": [
    {
      "id": "mem_s_a",
      "userId": "usr_s_a",
      "displayName": "학생 A (가상)",
      "nativeLanguage": "zh",
      "diagnosticStatus": "completed",
      "partResults": [
        {
          "area": "korean",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "korean",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "math",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "social",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "social",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "science",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "science",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "daily",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "daily",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        }
      ],
      "areaResults": [
        {
          "area": "korean",
          "score": 200,
          "maxScore": 200,
          "level": "advanced"
        },
        {
          "area": "math",
          "score": 200,
          "maxScore": 200,
          "level": "advanced"
        },
        {
          "area": "social",
          "score": 200,
          "maxScore": 200,
          "level": "advanced"
        },
        {
          "area": "science",
          "score": 200,
          "maxScore": 200,
          "level": "advanced"
        },
        {
          "area": "daily",
          "score": 200,
          "maxScore": 200,
          "level": "advanced"
        }
      ]
    },
    {
      "id": "mem_s_b",
      "userId": "usr_s_b",
      "displayName": "학생 B (가상)",
      "nativeLanguage": "vi",
      "diagnosticStatus": "completed",
      "partResults": [
        {
          "area": "korean",
          "skill": "listening",
          "score": 0,
          "maxScore": 100,
          "level": "below_beginner"
        },
        {
          "area": "korean",
          "skill": "reading",
          "score": 0,
          "maxScore": 100,
          "level": "below_beginner"
        },
        {
          "area": "math",
          "skill": "listening",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        },
        {
          "area": "social",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "social",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "science",
          "skill": "listening",
          "score": 80,
          "maxScore": 100,
          "level": "beginner"
        },
        {
          "area": "science",
          "skill": "reading",
          "score": 80,
          "maxScore": 100,
          "level": "beginner"
        },
        {
          "area": "daily",
          "skill": "listening",
          "score": 5,
          "maxScore": 100,
          "level": "beginner"
        },
        {
          "area": "daily",
          "skill": "reading",
          "score": 5,
          "maxScore": 100,
          "level": "beginner"
        }
      ],
      "areaResults": [
        {
          "area": "korean",
          "score": 0,
          "maxScore": 200,
          "level": "beginner"
        },
        {
          "area": "math",
          "score": 80,
          "maxScore": 200,
          "level": "intermediate"
        },
        {
          "area": "social",
          "score": 200,
          "maxScore": 200,
          "level": "advanced"
        },
        {
          "area": "science",
          "score": 160,
          "maxScore": 200,
          "level": "advanced"
        },
        {
          "area": "daily",
          "score": 10,
          "maxScore": 200,
          "level": "beginner"
        }
      ]
    },
    {
      "id": "mem_s_pending",
      "userId": "usr_s_pending",
      "displayName": "s_pending (가상)",
      "nativeLanguage": "mn",
      "diagnosticStatus": "in_progress",
      "partResults": [],
      "areaResults": []
    }
  ],
  "nextCursor": null
}
```

### 학생 B 진단 상세

`GET /api/v1/classes/cls_1/students/mem_s_b/diagnostic` → 200

응답:
```json
{
  "studentMemberId": "mem_s_b",
  "status": "completed",
  "results": {
    "formId": "form_mock_v1",
    "isSynthetic": true,
    "parts": [
      {
        "area": "korean",
        "skill": "listening",
        "score": 0,
        "maxScore": 100,
        "level": "below_beginner"
      },
      {
        "area": "korean",
        "skill": "reading",
        "score": 0,
        "maxScore": 100,
        "level": "below_beginner"
      },
      {
        "area": "math",
        "skill": "listening",
        "score": 40,
        "maxScore": 100,
        "level": "intermediate"
      },
      {
        "area": "math",
        "skill": "reading",
        "score": 40,
        "maxScore": 100,
        "level": "intermediate"
      },
      {
        "area": "social",
        "skill": "listening",
        "score": 100,
        "maxScore": 100,
        "level": "advanced"
      },
      {
        "area": "social",
        "skill": "reading",
        "score": 100,
        "maxScore": 100,
        "level": "advanced"
      },
      {
        "area": "science",
        "skill": "listening",
        "score": 80,
        "maxScore": 100,
        "level": "beginner"
      },
      {
        "area": "science",
        "skill": "reading",
        "score": 80,
        "maxScore": 100,
        "level": "beginner"
      },
      {
        "area": "daily",
        "skill": "listening",
        "score": 5,
        "maxScore": 100,
        "level": "beginner"
      },
      {
        "area": "daily",
        "skill": "reading",
        "score": 5,
        "maxScore": 100,
        "level": "beginner"
      }
    ],
    "areas": [
      {
        "area": "korean",
        "score": 0,
        "maxScore": 200,
        "level": "beginner"
      },
      {
        "area": "math",
        "score": 80,
        "maxScore": 200,
        "level": "intermediate"
      },
      {
        "area": "social",
        "score": 200,
        "maxScore": 200,
        "level": "advanced"
      },
      {
        "area": "science",
        "score": 160,
        "maxScore": 200,
        "level": "advanced"
      },
      {
        "area": "daily",
        "score": 10,
        "maxScore": 200,
        "level": "beginner"
      }
    ]
  }
}
```

### 자기 교과 원본 목록

`GET /api/v1/classes/cls_1/sources` → 200

응답:
```json
{
  "items": [
    {
      "id": "src_math_1",
      "classId": "cls_1",
      "createdBy": "usr_t_math",
      "fileId": "file_src_math_1",
      "title": "비와 비율 (가상)",
      "subject": "math",
      "unit": "1단원",
      "unitNumber": null,
      "thumbnailUrl": null,
      "sourceText": "자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.",
      "sentences": [
        {
          "id": "s1",
          "text": "자료의 첫 문장입니다."
        }
      ],
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "archived": false
    }
  ],
  "nextCursor": null
}
```

### 다른 교과 자료 접근 거절

`GET /api/v1/sources/src_science_1` → 404

응답:
```json
{
  "code": "NOT_FOUND",
  "message": "자료를 찾을 수 없습니다.",
  "requestId": "mock-request-example",
  "details": null
}
```

### 교사 전환본 목록

`GET /api/v1/classes/cls_1/materials` → 200

응답:
```json
{
  "items": [
    {
      "id": "mat_a_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "unit": "1단원",
      "status": "published",
      "version": 1,
      "revision": 1,
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "isRecentPublished": true,
      "unitNumber": null,
      "thumbnailUrl": null,
      "originalContent": "자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.",
      "createdBy": "usr_t_math"
    },
    {
      "id": "mat_b_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_b",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "unit": "1단원",
      "status": "draft",
      "version": 1,
      "revision": 1,
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": null,
      "reviewedAt": null,
      "isRecentPublished": false,
      "unitNumber": null,
      "thumbnailUrl": null,
      "originalContent": "자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.",
      "createdBy": "usr_t_math"
    }
  ],
  "nextCursor": null
}
```

### 교사 문제 검토 정답 포함

`GET /api/v1/quizzes/quiz_a_math_1` → 200

응답:
```json
{
  "id": "quiz_a_math_1",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상) 확인문제",
  "status": "published",
  "version": 1,
  "questionType": "multiple_choice_4",
  "questions": [
    {
      "id": "quiz_a_math_1_q1",
      "position": 1,
      "questionType": "multiple_choice_4",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (1)",
      "choices": [
        {
          "id": "1",
          "text": "예시 보기 1"
        },
        {
          "id": "2",
          "text": "예시 보기 2"
        },
        {
          "id": "3",
          "text": "예시 보기 3"
        },
        {
          "id": "4",
          "text": "예시 보기 4"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    },
    {
      "id": "quiz_a_math_1_q2",
      "position": 2,
      "questionType": "multiple_choice_4",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (2)",
      "choices": [
        {
          "id": "1",
          "text": "예시 보기 1"
        },
        {
          "id": "2",
          "text": "예시 보기 2"
        },
        {
          "id": "3",
          "text": "예시 보기 3"
        },
        {
          "id": "4",
          "text": "예시 보기 4"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    },
    {
      "id": "quiz_a_math_1_q3",
      "position": 3,
      "questionType": "multiple_choice_4",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (3)",
      "choices": [
        {
          "id": "1",
          "text": "예시 보기 1"
        },
        {
          "id": "2",
          "text": "예시 보기 2"
        },
        {
          "id": "3",
          "text": "예시 보기 3"
        },
        {
          "id": "4",
          "text": "예시 보기 4"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    }
  ],
  "questionCount": 3,
  "publishedAt": "2026-11-21T07:26:32.867921Z",
  "inputMaterialId": null,
  "generationNo": 1,
  "createdBy": "usr_t_math",
  "createdAt": "2026-11-21T07:26:32.867921Z",
  "reviewedAt": "2026-11-21T07:26:32.867921Z"
}
```

### 학생 초대 발급

`POST /api/v1/classes/cls_1/invitations` → 201

요청:
```json
{
  "invitedRole": "student",
  "maxUses": 2,
  "expiresInHours": 24
}
```

응답:
```json
{
  "id": "inv_101",
  "classId": "cls_1",
  "createdBy": "usr_t_math",
  "code": "MOCK-EXAMPLE-CODE",
  "invitedRole": "student",
  "teacherSubject": null,
  "maxUses": 2,
  "usedCount": 0,
  "expiresAt": "2026-11-22T07:26:32.929265+00:00",
  "revoked": false
}
```

### 로그인 s_new

`POST /api/v1/auth/login` → 200

요청:
```json
{
  "loginId": "s_new",
  "password": "mock-pass-123",
  "role": "student"
}
```

응답:
```json
{
  "user": {
    "id": "usr_s_new",
    "loginId": "s_new",
    "role": "student",
    "displayName": "s_new (가상)",
    "nativeLanguage": "ru"
  },
  "csrfToken": "CSRF_TOKEN_FROM_LOGIN_RESPONSE",
  "nextAction": "join_class"
}
```

### 클래스 초대 수락

`POST /api/v1/invitations/accept` → 200

요청:
```json
{
  "code": "MOCK-EXAMPLE-CODE"
}
```

응답:
```json
{
  "membership": {
    "id": "mem_101",
    "classId": "cls_1",
    "userId": "usr_s_new",
    "role": "student",
    "teacherSubject": null,
    "status": "active"
  },
  "alreadyMember": false,
  "nextAction": "diagnostic"
}
```

### 최초 진단 시작

`POST /api/v1/diagnostic/start` → 200

요청:
```json
{
  "classId": "cls_1"
}
```

응답:
```json
{
  "status": "in_progress",
  "formId": "form_mock_v1",
  "totalQuestions": 70,
  "completedQuestions": 0,
  "nextQuestionId": "dq_001"
}
```

### 로그인 s_pending

`POST /api/v1/auth/login` → 200

요청:
```json
{
  "loginId": "s_pending",
  "password": "mock-pass-123",
  "role": "student"
}
```

응답:
```json
{
  "user": {
    "id": "usr_s_pending",
    "loginId": "s_pending",
    "role": "student",
    "displayName": "s_pending (가상)",
    "nativeLanguage": "mn"
  },
  "csrfToken": "CSRF_TOKEN_FROM_LOGIN_RESPONSE",
  "nextAction": "diagnostic"
}
```

### 진단 다음 미제출 문항

`GET /api/v1/diagnostic/next-question` → 200

응답:
```json
{
  "progress": {
    "status": "in_progress",
    "formId": "form_mock_v1",
    "totalQuestions": 70,
    "completedQuestions": 0,
    "nextQuestionId": "dq_001"
  },
  "question": {
    "id": "dq_001",
    "sequence": 1,
    "area": "korean",
    "skill": "listening",
    "prompt": "[가상 진단] korean listening 문제 1. 예시 설명과 일치하는 보기를 고르세요.",
    "options": [
      {
        "id": "1",
        "text": "예시 보기 1"
      },
      {
        "id": "2",
        "text": "예시 보기 2"
      },
      {
        "id": "3",
        "text": "예시 보기 3"
      },
      {
        "id": "4",
        "text": "예시 보기 4"
      }
    ],
    "audioUrl": null,
    "stimulusText": "가상 듣기 지문입니다. 실제 음원과 공식 문항은 별도로 등록해야 합니다.",
    "isSynthetic": true
  }
}
```

### 모르겠어요 제출도 저장

`POST /api/v1/diagnostic/answers` → 200

요청:
```json
{
  "questionId": "dq_001",
  "selectedOptionId": null
}
```

응답:
```json
{
  "progress": {
    "status": "in_progress",
    "formId": "form_mock_v1",
    "totalQuestions": 70,
    "completedQuestions": 1,
    "nextQuestionId": "dq_002"
  },
  "replayed": false
}
```

### 진단 다음 문항으로 이어하기

`GET /api/v1/diagnostic/next-question` → 200

응답:
```json
{
  "progress": {
    "status": "in_progress",
    "formId": "form_mock_v1",
    "totalQuestions": 70,
    "completedQuestions": 1,
    "nextQuestionId": "dq_002"
  },
  "question": {
    "id": "dq_002",
    "sequence": 2,
    "area": "korean",
    "skill": "listening",
    "prompt": "[가상 진단] korean listening 문제 2. 예시 설명과 일치하는 보기를 고르세요.",
    "options": [
      {
        "id": "1",
        "text": "예시 보기 1"
      },
      {
        "id": "2",
        "text": "예시 보기 2"
      },
      {
        "id": "3",
        "text": "예시 보기 3"
      },
      {
        "id": "4",
        "text": "예시 보기 4"
      }
    ],
    "audioUrl": null,
    "stimulusText": "가상 듣기 지문입니다. 실제 음원과 공식 문항은 별도로 등록해야 합니다.",
    "isSynthetic": true
  }
}
```

### 로그인 s_a

`POST /api/v1/auth/login` → 200

요청:
```json
{
  "loginId": "s_a",
  "password": "mock-pass-123",
  "role": "student"
}
```

응답:
```json
{
  "user": {
    "id": "usr_s_a",
    "loginId": "s_a",
    "role": "student",
    "displayName": "학생 A (가상)",
    "nativeLanguage": "zh"
  },
  "csrfToken": "CSRF_TOKEN_FROM_LOGIN_RESPONSE",
  "nextAction": "classes"
}
```

### 학생 대시보드 생활한국어

`GET /api/v1/classes/cls_1/dashboard?area=daily` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "displayName": "학생 A (가상)",
  "selectedArea": "daily",
  "parts": [
    {
      "area": "daily",
      "skill": "listening",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "daily",
      "skill": "reading",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    }
  ],
  "aggregate": {
    "area": "daily",
    "score": 200,
    "maxScore": 200,
    "level": "advanced"
  },
  "unansweredQuestionCount": 6,
  "retryQuestionCount": 0,
  "assignedQuizSetCount": 2,
  "newMaterials": [
    {
      "id": "mat_a_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_math",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    },
    {
      "id": "mat_a_science_1",
      "classId": "cls_1",
      "sourceId": "src_science_1",
      "studentMemberId": "mem_s_a",
      "subject": "science",
      "title": "물질의 상태 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_science",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    }
  ],
  "quizzes": [
    {
      "id": "quiz_a_math_1",
      "title": "비와 비율 (가상) 확인문제",
      "subject": "math",
      "progress": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 0,
        "status": "not_started",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 3,
        "retryCounts": {
          "quiz_a_math_1_q1": 0,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": []
      }
    },
    {
      "id": "quiz_a_science_1",
      "title": "물질의 상태 (가상) 확인문제",
      "subject": "science",
      "progress": {
        "quizId": "quiz_a_science_1",
        "questionCount": 3,
        "submittedQuestionCount": 0,
        "status": "not_started",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 3,
        "retryCounts": {
          "quiz_a_science_1_q1": 0,
          "quiz_a_science_1_q2": 0,
          "quiz_a_science_1_q3": 0
        },
        "wrongQuestions": []
      }
    }
  ]
}
```

### 학생 진단 결과 10파트와5종합

`GET /api/v1/diagnostic/results` → 200

응답:
```json
{
  "formId": "form_mock_v1",
  "isSynthetic": true,
  "parts": [
    {
      "area": "korean",
      "skill": "listening",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "korean",
      "skill": "reading",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "math",
      "skill": "listening",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "math",
      "skill": "reading",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "social",
      "skill": "listening",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "social",
      "skill": "reading",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "science",
      "skill": "listening",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "science",
      "skill": "reading",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "daily",
      "skill": "listening",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "daily",
      "skill": "reading",
      "score": 100.0,
      "maxScore": 100,
      "level": "advanced"
    }
  ],
  "areas": [
    {
      "area": "korean",
      "score": 200.0,
      "maxScore": 200,
      "level": "advanced"
    },
    {
      "area": "math",
      "score": 200.0,
      "maxScore": 200,
      "level": "advanced"
    },
    {
      "area": "social",
      "score": 200.0,
      "maxScore": 200,
      "level": "advanced"
    },
    {
      "area": "science",
      "score": 200.0,
      "maxScore": 200,
      "level": "advanced"
    },
    {
      "area": "daily",
      "score": 200.0,
      "maxScore": 200,
      "level": "advanced"
    }
  ]
}
```

### 학생에게 배포된 자료 목록

`GET /api/v1/classes/cls_1/materials` → 200

응답:
```json
{
  "items": [
    {
      "id": "mat_a_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "unit": "1단원",
      "status": "published",
      "version": 1,
      "revision": 1,
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "isRecentPublished": true,
      "unitNumber": null,
      "thumbnailUrl": null,
      "originalContent": null,
      "createdBy": "usr_t_math"
    },
    {
      "id": "mat_a_science_1",
      "classId": "cls_1",
      "sourceId": "src_science_1",
      "studentMemberId": "mem_s_a",
      "subject": "science",
      "title": "물질의 상태 (가상)",
      "unit": "1단원",
      "status": "published",
      "version": 1,
      "revision": 1,
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "isRecentPublished": true,
      "unitNumber": null,
      "thumbnailUrl": null,
      "originalContent": null,
      "createdBy": "usr_t_science"
    }
  ],
  "nextCursor": null
}
```

### 학생 전환본 상세

`GET /api/v1/materials/mat_a_math_1` → 200

응답:
```json
{
  "id": "mat_a_math_1",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상)",
  "unit": "1단원",
  "status": "published",
  "version": 1,
  "revision": 1,
  "content": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "쉽게 바꾼 가상 학습자료입니다."
      }
    ],
    "translations": []
  },
  "createdAt": "2026-11-21T07:26:32.867921Z",
  "publishedAt": "2026-11-21T07:26:32.867921Z",
  "reviewedAt": "2026-11-21T07:26:32.867921Z",
  "isRecentPublished": true,
  "unitNumber": null,
  "thumbnailUrl": null,
  "originalContent": null,
  "createdBy": "usr_t_math"
}
```

### 다른 학생 초안 접근 거절

`GET /api/v1/materials/mat_b_math_1` → 404

응답:
```json
{
  "code": "NOT_FOUND",
  "message": "자료를 찾을 수 없습니다.",
  "requestId": "mock-request-example",
  "details": null
}
```

### 학생 문제 상세 정답 제외

`GET /api/v1/quizzes/quiz_a_math_1` → 200

응답:
```json
{
  "id": "quiz_a_math_1",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상) 확인문제",
  "status": "published",
  "version": 1,
  "questionType": "multiple_choice_4",
  "questions": [
    {
      "id": "quiz_a_math_1_q1",
      "position": 1,
      "questionType": "multiple_choice_4",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (1)",
      "choices": [
        {
          "id": "1",
          "text": "예시 보기 1"
        },
        {
          "id": "2",
          "text": "예시 보기 2"
        },
        {
          "id": "3",
          "text": "예시 보기 3"
        },
        {
          "id": "4",
          "text": "예시 보기 4"
        }
      ],
      "maxPoints": 1.0
    },
    {
      "id": "quiz_a_math_1_q2",
      "position": 2,
      "questionType": "multiple_choice_4",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (2)",
      "choices": [
        {
          "id": "1",
          "text": "예시 보기 1"
        },
        {
          "id": "2",
          "text": "예시 보기 2"
        },
        {
          "id": "3",
          "text": "예시 보기 3"
        },
        {
          "id": "4",
          "text": "예시 보기 4"
        }
      ],
      "maxPoints": 1.0
    },
    {
      "id": "quiz_a_math_1_q3",
      "position": 3,
      "questionType": "multiple_choice_4",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (3)",
      "choices": [
        {
          "id": "1",
          "text": "예시 보기 1"
        },
        {
          "id": "2",
          "text": "예시 보기 2"
        },
        {
          "id": "3",
          "text": "예시 보기 3"
        },
        {
          "id": "4",
          "text": "예시 보기 4"
        }
      ],
      "maxPoints": 1.0
    }
  ],
  "questionCount": 3,
  "publishedAt": "2026-11-21T07:26:32.867921Z",
  "progress": {
    "quizId": "quiz_a_math_1",
    "questionCount": 3,
    "submittedQuestionCount": 0,
    "status": "not_started",
    "firstScore": null,
    "maxScore": 3.0,
    "firstCorrectCount": null,
    "latestCorrectCount": 0,
    "currentWrongCount": 0,
    "unansweredQuestionCount": 3,
    "retryCounts": {
      "quiz_a_math_1_q1": 0,
      "quiz_a_math_1_q2": 0,
      "quiz_a_math_1_q3": 0
    },
    "wrongQuestions": []
  },
  "passage": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "자료의 첫 문장입니다."
      }
    ]
  },
  "inputMaterialId": null,
  "generationNo": 1,
  "createdBy": "usr_t_math",
  "createdAt": "2026-11-21T07:26:32.867921Z",
  "reviewedAt": "2026-11-21T07:26:32.867921Z"
}
```

### 제출 전 해설 거절

`GET /api/v1/quizzes/quiz_a_math_1/questions/quiz_a_math_1_q1/explanation` → 403

응답:
```json
{
  "code": "ANSWER_REQUIRED",
  "message": "먼저 이 문제에 답해 주세요.",
  "requestId": "mock-request-example",
  "details": null
}
```

### 첫 문제 오답 저장

`POST /api/v1/quizzes/quiz_a_math_1/answers` → 200

요청:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "selectedOptionId": "2"
}
```

응답:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "attemptNo": 1,
  "isCorrect": false,
  "points": 0.0,
  "retryCount": 0,
  "replayed": false,
  "results": {
    "quizId": "quiz_a_math_1",
    "questionCount": 3,
    "submittedQuestionCount": 1,
    "status": "in_progress",
    "firstScore": null,
    "maxScore": 3.0,
    "firstCorrectCount": null,
    "latestCorrectCount": 0,
    "currentWrongCount": 1,
    "unansweredQuestionCount": 2,
    "retryCounts": {
      "quiz_a_math_1_q1": 0,
      "quiz_a_math_1_q2": 0,
      "quiz_a_math_1_q3": 0
    },
    "wrongQuestions": [
      {
        "questionId": "quiz_a_math_1_q1",
        "position": 1,
        "retryCount": 0
      }
    ]
  }
}
```

### 학생 대시보드 풀이 중

`GET /api/v1/classes/cls_1/dashboard?area=daily` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "displayName": "학생 A (가상)",
  "selectedArea": "daily",
  "parts": [
    {
      "area": "daily",
      "skill": "listening",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "daily",
      "skill": "reading",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    }
  ],
  "aggregate": {
    "area": "daily",
    "score": 200,
    "maxScore": 200,
    "level": "advanced"
  },
  "unansweredQuestionCount": 5,
  "retryQuestionCount": 1,
  "assignedQuizSetCount": 2,
  "newMaterials": [
    {
      "id": "mat_a_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_math",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    },
    {
      "id": "mat_a_science_1",
      "classId": "cls_1",
      "sourceId": "src_science_1",
      "studentMemberId": "mem_s_a",
      "subject": "science",
      "title": "물질의 상태 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_science",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    }
  ],
  "quizzes": [
    {
      "id": "quiz_a_math_1",
      "title": "비와 비율 (가상) 확인문제",
      "subject": "math",
      "progress": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 1,
        "status": "in_progress",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 1,
        "unansweredQuestionCount": 2,
        "retryCounts": {
          "quiz_a_math_1_q1": 0,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": [
          {
            "questionId": "quiz_a_math_1_q1",
            "position": 1,
            "retryCount": 0
          }
        ]
      }
    },
    {
      "id": "quiz_a_science_1",
      "title": "물질의 상태 (가상) 확인문제",
      "subject": "science",
      "progress": {
        "quizId": "quiz_a_science_1",
        "questionCount": 3,
        "submittedQuestionCount": 0,
        "status": "not_started",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 3,
        "retryCounts": {
          "quiz_a_science_1_q1": 0,
          "quiz_a_science_1_q2": 0,
          "quiz_a_science_1_q3": 0
        },
        "wrongQuestions": []
      }
    }
  ]
}
```

### 교사 대시보드 학생 첫 풀이 중

`GET /api/v1/classes/cls_1/dashboard` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "selectedArea": "math",
  "teacherSubject": "math",
  "studentCount": 4,
  "levelCounts": {
    "below_beginner": 0,
    "beginner": 0,
    "intermediate": 1,
    "advanced": 1,
    "not_diagnosed": 2
  },
  "pendingReviewQuizSetCount": 1,
  "students": [
    {
      "studentMemberId": "mem_s_a",
      "displayName": "학생 A (가상)",
      "nativeLanguage": "zh",
      "diagnosticStatus": "completed",
      "selectedArea": "math",
      "parts": [
        {
          "area": "math",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        }
      ],
      "aggregate": {
        "area": "math",
        "score": 200,
        "maxScore": 200,
        "level": "advanced"
      },
      "latestQuiz": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 1,
        "status": "in_progress",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 1,
        "unansweredQuestionCount": 2,
        "retryCounts": {
          "quiz_a_math_1_q1": 0,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": [
          {
            "questionId": "quiz_a_math_1_q1",
            "position": 1,
            "retryCount": 0
          }
        ]
      }
    },
    {
      "studentMemberId": "mem_s_b",
      "displayName": "학생 B (가상)",
      "nativeLanguage": "vi",
      "diagnosticStatus": "completed",
      "selectedArea": "math",
      "parts": [
        {
          "area": "math",
          "skill": "listening",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        }
      ],
      "aggregate": {
        "area": "math",
        "score": 80,
        "maxScore": 200,
        "level": "intermediate"
      },
      "latestQuiz": null
    },
    {
      "studentMemberId": "mem_s_pending",
      "displayName": "s_pending (가상)",
      "nativeLanguage": "mn",
      "diagnosticStatus": "in_progress",
      "selectedArea": "math",
      "parts": [],
      "aggregate": null,
      "latestQuiz": null
    },
    {
      "studentMemberId": "mem_101",
      "displayName": "s_new (가상)",
      "nativeLanguage": "ru",
      "diagnosticStatus": "in_progress",
      "selectedArea": "math",
      "parts": [],
      "aggregate": null,
      "latestQuiz": null
    }
  ]
}
```

### 같은 답안 재전송 중복 방지

`POST /api/v1/quizzes/quiz_a_math_1/answers` → 200

요청:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "selectedOptionId": "2"
}
```

응답:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "attemptNo": 1,
  "isCorrect": false,
  "points": 0.0,
  "retryCount": 0,
  "replayed": true,
  "results": {
    "quizId": "quiz_a_math_1",
    "questionCount": 3,
    "submittedQuestionCount": 1,
    "status": "in_progress",
    "firstScore": null,
    "maxScore": 3.0,
    "firstCorrectCount": null,
    "latestCorrectCount": 0,
    "currentWrongCount": 1,
    "unansweredQuestionCount": 2,
    "retryCounts": {
      "quiz_a_math_1_q1": 0,
      "quiz_a_math_1_q2": 0,
      "quiz_a_math_1_q3": 0
    },
    "wrongQuestions": [
      {
        "questionId": "quiz_a_math_1_q1",
        "position": 1,
        "retryCount": 0
      }
    ]
  }
}
```

### 나머지 최초 답안 2

`POST /api/v1/quizzes/quiz_a_math_1/answers` → 200

요청:
```json
{
  "questionId": "quiz_a_math_1_q2",
  "selectedOptionId": "1"
}
```

응답:
```json
{
  "questionId": "quiz_a_math_1_q2",
  "attemptNo": 1,
  "isCorrect": true,
  "points": 1.0,
  "retryCount": 0,
  "replayed": false,
  "results": {
    "quizId": "quiz_a_math_1",
    "questionCount": 3,
    "submittedQuestionCount": 2,
    "status": "in_progress",
    "firstScore": null,
    "maxScore": 3.0,
    "firstCorrectCount": null,
    "latestCorrectCount": 1,
    "currentWrongCount": 1,
    "unansweredQuestionCount": 1,
    "retryCounts": {
      "quiz_a_math_1_q1": 0,
      "quiz_a_math_1_q2": 0,
      "quiz_a_math_1_q3": 0
    },
    "wrongQuestions": [
      {
        "questionId": "quiz_a_math_1_q1",
        "position": 1,
        "retryCount": 0
      }
    ]
  }
}
```

### 나머지 최초 답안 3

`POST /api/v1/quizzes/quiz_a_math_1/answers` → 200

요청:
```json
{
  "questionId": "quiz_a_math_1_q3",
  "selectedOptionId": "1"
}
```

응답:
```json
{
  "questionId": "quiz_a_math_1_q3",
  "attemptNo": 1,
  "isCorrect": true,
  "points": 1.0,
  "retryCount": 0,
  "replayed": false,
  "results": {
    "quizId": "quiz_a_math_1",
    "questionCount": 3,
    "submittedQuestionCount": 3,
    "status": "completed",
    "firstScore": 2.0,
    "maxScore": 3.0,
    "firstCorrectCount": 2,
    "latestCorrectCount": 2,
    "currentWrongCount": 1,
    "unansweredQuestionCount": 0,
    "retryCounts": {
      "quiz_a_math_1_q1": 0,
      "quiz_a_math_1_q2": 0,
      "quiz_a_math_1_q3": 0
    },
    "wrongQuestions": [
      {
        "questionId": "quiz_a_math_1_q1",
        "position": 1,
        "retryCount": 0
      }
    ]
  }
}
```

### 학생 대시보드 최초 풀이 완료 오답 남음

`GET /api/v1/classes/cls_1/dashboard?area=math` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "displayName": "학생 A (가상)",
  "selectedArea": "math",
  "parts": [
    {
      "area": "math",
      "skill": "listening",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "math",
      "skill": "reading",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    }
  ],
  "aggregate": {
    "area": "math",
    "score": 200,
    "maxScore": 200,
    "level": "advanced"
  },
  "unansweredQuestionCount": 3,
  "retryQuestionCount": 1,
  "assignedQuizSetCount": 2,
  "newMaterials": [
    {
      "id": "mat_a_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_math",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    },
    {
      "id": "mat_a_science_1",
      "classId": "cls_1",
      "sourceId": "src_science_1",
      "studentMemberId": "mem_s_a",
      "subject": "science",
      "title": "물질의 상태 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_science",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    }
  ],
  "quizzes": [
    {
      "id": "quiz_a_math_1",
      "title": "비와 비율 (가상) 확인문제",
      "subject": "math",
      "progress": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 3,
        "status": "completed",
        "firstScore": 2,
        "maxScore": 3,
        "firstCorrectCount": 2,
        "latestCorrectCount": 2,
        "currentWrongCount": 1,
        "unansweredQuestionCount": 0,
        "retryCounts": {
          "quiz_a_math_1_q1": 0,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": [
          {
            "questionId": "quiz_a_math_1_q1",
            "position": 1,
            "retryCount": 0
          }
        ]
      }
    },
    {
      "id": "quiz_a_science_1",
      "title": "물질의 상태 (가상) 확인문제",
      "subject": "science",
      "progress": {
        "quizId": "quiz_a_science_1",
        "questionCount": 3,
        "submittedQuestionCount": 0,
        "status": "not_started",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 3,
        "retryCounts": {
          "quiz_a_science_1_q1": 0,
          "quiz_a_science_1_q2": 0,
          "quiz_a_science_1_q3": 0
        },
        "wrongQuestions": []
      }
    }
  ]
}
```

### 최초 성적 결과

`GET /api/v1/quizzes/quiz_a_math_1/results` → 200

응답:
```json
{
  "quizId": "quiz_a_math_1",
  "questionCount": 3,
  "submittedQuestionCount": 3,
  "status": "completed",
  "firstScore": 2.0,
  "maxScore": 3.0,
  "firstCorrectCount": 2,
  "latestCorrectCount": 2,
  "currentWrongCount": 1,
  "unansweredQuestionCount": 0,
  "retryCounts": {
    "quiz_a_math_1_q1": 0,
    "quiz_a_math_1_q2": 0,
    "quiz_a_math_1_q3": 0
  },
  "wrongQuestions": [
    {
      "questionId": "quiz_a_math_1_q1",
      "position": 1,
      "retryCount": 0
    }
  ]
}
```

### 제출 후 해설

`GET /api/v1/quizzes/quiz_a_math_1/questions/quiz_a_math_1_q1/explanation` → 200

응답:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "correctOptionId": "1",
  "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요."
}
```

### 오답 재풀이 성공 최초점수 유지

`POST /api/v1/quizzes/quiz_a_math_1/answers` → 200

요청:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "selectedOptionId": "1"
}
```

응답:
```json
{
  "questionId": "quiz_a_math_1_q1",
  "attemptNo": 2,
  "isCorrect": true,
  "points": 1.0,
  "retryCount": 1,
  "replayed": false,
  "results": {
    "quizId": "quiz_a_math_1",
    "questionCount": 3,
    "submittedQuestionCount": 3,
    "status": "completed",
    "firstScore": 2.0,
    "maxScore": 3.0,
    "firstCorrectCount": 2,
    "latestCorrectCount": 3,
    "currentWrongCount": 0,
    "unansweredQuestionCount": 0,
    "retryCounts": {
      "quiz_a_math_1_q1": 1,
      "quiz_a_math_1_q2": 0,
      "quiz_a_math_1_q3": 0
    },
    "wrongQuestions": []
  }
}
```

### 교사 대시보드 재풀이 후 최초 성적 보존

`GET /api/v1/classes/cls_1/dashboard` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "selectedArea": "math",
  "teacherSubject": "math",
  "studentCount": 4,
  "levelCounts": {
    "below_beginner": 0,
    "beginner": 0,
    "intermediate": 1,
    "advanced": 1,
    "not_diagnosed": 2
  },
  "pendingReviewQuizSetCount": 1,
  "students": [
    {
      "studentMemberId": "mem_s_a",
      "displayName": "학생 A (가상)",
      "nativeLanguage": "zh",
      "diagnosticStatus": "completed",
      "selectedArea": "math",
      "parts": [
        {
          "area": "math",
          "skill": "listening",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 100,
          "maxScore": 100,
          "level": "advanced"
        }
      ],
      "aggregate": {
        "area": "math",
        "score": 200,
        "maxScore": 200,
        "level": "advanced"
      },
      "latestQuiz": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 3,
        "status": "completed",
        "firstScore": 2,
        "maxScore": 3,
        "firstCorrectCount": 2,
        "latestCorrectCount": 3,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 0,
        "retryCounts": {
          "quiz_a_math_1_q1": 1,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": []
      }
    },
    {
      "studentMemberId": "mem_s_b",
      "displayName": "학생 B (가상)",
      "nativeLanguage": "vi",
      "diagnosticStatus": "completed",
      "selectedArea": "math",
      "parts": [
        {
          "area": "math",
          "skill": "listening",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        },
        {
          "area": "math",
          "skill": "reading",
          "score": 40,
          "maxScore": 100,
          "level": "intermediate"
        }
      ],
      "aggregate": {
        "area": "math",
        "score": 80,
        "maxScore": 200,
        "level": "intermediate"
      },
      "latestQuiz": null
    },
    {
      "studentMemberId": "mem_s_pending",
      "displayName": "s_pending (가상)",
      "nativeLanguage": "mn",
      "diagnosticStatus": "in_progress",
      "selectedArea": "math",
      "parts": [],
      "aggregate": null,
      "latestQuiz": null
    },
    {
      "studentMemberId": "mem_101",
      "displayName": "s_new (가상)",
      "nativeLanguage": "ru",
      "diagnosticStatus": "in_progress",
      "selectedArea": "math",
      "parts": [],
      "aggregate": null,
      "latestQuiz": null
    }
  ]
}
```

### 학생 대시보드 재풀이 후 현재 오답 해소

`GET /api/v1/classes/cls_1/dashboard?area=math` → 200

응답:
```json
{
  "classId": "cls_1",
  "className": "가상 3학년 2반",
  "displayName": "학생 A (가상)",
  "selectedArea": "math",
  "parts": [
    {
      "area": "math",
      "skill": "listening",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    },
    {
      "area": "math",
      "skill": "reading",
      "score": 100,
      "maxScore": 100,
      "level": "advanced"
    }
  ],
  "aggregate": {
    "area": "math",
    "score": 200,
    "maxScore": 200,
    "level": "advanced"
  },
  "unansweredQuestionCount": 3,
  "retryQuestionCount": 0,
  "assignedQuizSetCount": 2,
  "newMaterials": [
    {
      "id": "mat_a_math_1",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "subject": "math",
      "title": "비와 비율 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_math",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    },
    {
      "id": "mat_a_science_1",
      "classId": "cls_1",
      "sourceId": "src_science_1",
      "studentMemberId": "mem_s_a",
      "subject": "science",
      "title": "물질의 상태 (가상)",
      "status": "published",
      "version": 1,
      "revision": 1,
      "createdBy": "usr_t_science",
      "content": {
        "paragraphs": [
          {
            "id": "s1",
            "text": "쉽게 바꾼 가상 학습자료입니다."
          }
        ],
        "translations": []
      },
      "createdAt": "2026-11-21T07:26:32.867921Z",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "reviewedAt": "2026-11-21T07:26:32.867921Z",
      "thumbnailUrl": null,
      "unitNumber": null,
      "isRecentPublished": true,
      "unit": "1단원"
    }
  ],
  "quizzes": [
    {
      "id": "quiz_a_math_1",
      "title": "비와 비율 (가상) 확인문제",
      "subject": "math",
      "progress": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 3,
        "status": "completed",
        "firstScore": 2,
        "maxScore": 3,
        "firstCorrectCount": 2,
        "latestCorrectCount": 3,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 0,
        "retryCounts": {
          "quiz_a_math_1_q1": 1,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": []
      }
    },
    {
      "id": "quiz_a_science_1",
      "title": "물질의 상태 (가상) 확인문제",
      "subject": "science",
      "progress": {
        "quizId": "quiz_a_science_1",
        "questionCount": 3,
        "submittedQuestionCount": 0,
        "status": "not_started",
        "firstScore": null,
        "maxScore": 3,
        "firstCorrectCount": null,
        "latestCorrectCount": 0,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 3,
        "retryCounts": {
          "quiz_a_science_1_q1": 0,
          "quiz_a_science_1_q2": 0,
          "quiz_a_science_1_q3": 0
        },
        "wrongQuestions": []
      }
    }
  ]
}
```

### 교사 최근 풀이 내역

`GET /api/v1/classes/cls_1/activity` → 200

응답:
```json
{
  "items": [
    {
      "quizId": "quiz_a_math_1",
      "title": "비와 비율 (가상) 확인문제",
      "studentMemberId": "mem_s_a",
      "publishedAt": "2026-11-21T07:26:32.867921Z",
      "lastAnsweredAt": "2026-11-21T07:26:33.087836Z",
      "results": {
        "quizId": "quiz_a_math_1",
        "questionCount": 3,
        "submittedQuestionCount": 3,
        "status": "completed",
        "firstScore": 2,
        "maxScore": 3,
        "firstCorrectCount": 2,
        "latestCorrectCount": 3,
        "currentWrongCount": 0,
        "unansweredQuestionCount": 0,
        "retryCounts": {
          "quiz_a_math_1_q1": 1,
          "quiz_a_math_1_q2": 0,
          "quiz_a_math_1_q3": 0
        },
        "wrongQuestions": []
      }
    }
  ],
  "nextCursor": null
}
```

### 여러 학생 전환 작업 접수

`POST /api/v1/classes/cls_1/generation-jobs` → 202

요청:
```json
{
  "sourceId": "src_math_1",
  "studentMemberIds": [
    "mem_s_a",
    "mem_s_b"
  ],
  "operation": "convert"
}
```

응답:
```json
{
  "items": [
    {
      "id": "job_101",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "credentialId": "cred_t_math",
      "operation": "convert",
      "status": "queued",
      "resultId": null,
      "resultType": null,
      "createdBy": "usr_t_math",
      "inputMaterialId": null,
      "questionType": null,
      "questionCount": null,
      "isMock": true
    },
    {
      "id": "job_102",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_b",
      "credentialId": "cred_t_math",
      "operation": "convert",
      "status": "queued",
      "resultId": null,
      "resultType": null,
      "createdBy": "usr_t_math",
      "inputMaterialId": null,
      "questionType": null,
      "questionCount": null,
      "isMock": true
    }
  ],
  "nextCursor": null
}
```

### 학생 A 전환 작업 완료 mock

`GET /api/v1/generation-jobs/job_101` → 200

응답:
```json
{
  "id": "job_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "credentialId": "cred_t_math",
  "operation": "convert",
  "status": "succeeded",
  "resultId": "mat_101",
  "resultType": "material",
  "createdBy": "usr_t_math",
  "inputMaterialId": null,
  "questionType": null,
  "questionCount": null,
  "isMock": true
}
```

### 학생 B 독립 전환 작업 완료 mock

`GET /api/v1/generation-jobs/job_102` → 200

응답:
```json
{
  "id": "job_102",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_b",
  "credentialId": "cred_t_math",
  "operation": "convert",
  "status": "succeeded",
  "resultId": "mat_102",
  "resultType": "material",
  "createdBy": "usr_t_math",
  "inputMaterialId": null,
  "questionType": null,
  "questionCount": null,
  "isMock": true
}
```

### 생성 전환본 검토 전 초안

`GET /api/v1/materials/mat_101` → 200

응답:
```json
{
  "id": "mat_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상)",
  "unit": "1단원",
  "status": "draft",
  "version": 1,
  "revision": 2,
  "content": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "[가상 전환] 쉽게 읽는 학생별 자료입니다."
      }
    ],
    "translations": []
  },
  "createdAt": "2026-11-21T07:26:33.103928Z",
  "publishedAt": null,
  "reviewedAt": null,
  "isRecentPublished": false,
  "unitNumber": null,
  "thumbnailUrl": null,
  "originalContent": "자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.",
  "createdBy": "usr_t_math"
}
```

### 교사 전환본 검토 완료

`POST /api/v1/materials/mat_101/review` → 200

응답:
```json
{
  "id": "mat_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상)",
  "unit": "1단원",
  "status": "reviewed",
  "version": 2,
  "revision": 2,
  "content": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "[가상 전환] 쉽게 읽는 학생별 자료입니다."
      }
    ],
    "translations": []
  },
  "createdAt": "2026-11-21T07:26:33.103928Z",
  "publishedAt": null,
  "reviewedAt": "2026-11-21T07:26:33.111173Z",
  "isRecentPublished": false,
  "unitNumber": null,
  "thumbnailUrl": null,
  "originalContent": "자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.",
  "createdBy": "usr_t_math",
  "reviewedBy": "usr_t_math",
  "updatedAt": "2026-11-21T07:26:33.111182Z"
}
```

### 교사 전환본 배포

`POST /api/v1/materials/mat_101/publish` → 200

응답:
```json
{
  "id": "mat_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상)",
  "unit": "1단원",
  "status": "published",
  "version": 3,
  "revision": 2,
  "content": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "[가상 전환] 쉽게 읽는 학생별 자료입니다."
      }
    ],
    "translations": []
  },
  "createdAt": "2026-11-21T07:26:33.103928Z",
  "publishedAt": "2026-11-21T07:26:33.113613Z",
  "reviewedAt": "2026-11-21T07:26:33.111173Z",
  "isRecentPublished": true,
  "unitNumber": null,
  "thumbnailUrl": null,
  "originalContent": "자료의 첫 문장입니다. 가상 자료를 읽고 설명을 확인합니다.",
  "createdBy": "usr_t_math",
  "reviewedBy": "usr_t_math",
  "updatedAt": "2026-11-21T07:26:33.113622Z",
  "publishedBy": "usr_t_math"
}
```

### 학생이 새 배포 전환본 확인

`GET /api/v1/materials/mat_101` → 200

응답:
```json
{
  "id": "mat_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상)",
  "unit": "1단원",
  "status": "published",
  "version": 3,
  "revision": 2,
  "content": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "[가상 전환] 쉽게 읽는 학생별 자료입니다."
      }
    ],
    "translations": []
  },
  "createdAt": "2026-11-21T07:26:33.103928Z",
  "publishedAt": "2026-11-21T07:26:33.113613Z",
  "reviewedAt": "2026-11-21T07:26:33.111173Z",
  "isRecentPublished": true,
  "unitNumber": null,
  "thumbnailUrl": null,
  "originalContent": null,
  "createdBy": "usr_t_math",
  "reviewedBy": "usr_t_math",
  "updatedAt": "2026-11-21T07:26:33.113622Z",
  "publishedBy": "usr_t_math"
}
```

### 원본에서 학생별 T/F 생성

`POST /api/v1/classes/cls_1/generation-jobs` → 202

요청:
```json
{
  "sourceId": "src_math_1",
  "studentMemberIds": [
    "mem_s_a"
  ],
  "operation": "generate_quiz",
  "questionType": "true_false",
  "questionCount": 2
}
```

응답:
```json
{
  "items": [
    {
      "id": "job_103",
      "classId": "cls_1",
      "sourceId": "src_math_1",
      "studentMemberId": "mem_s_a",
      "credentialId": "cred_t_math",
      "operation": "generate_quiz",
      "status": "queued",
      "resultId": null,
      "resultType": null,
      "createdBy": "usr_t_math",
      "inputMaterialId": null,
      "questionType": "true_false",
      "questionCount": 2,
      "isMock": true
    }
  ],
  "nextCursor": null
}
```

### T/F 작업 완료 mock

`GET /api/v1/generation-jobs/job_103` → 200

응답:
```json
{
  "id": "job_103",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "credentialId": "cred_t_math",
  "operation": "generate_quiz",
  "status": "succeeded",
  "resultId": "quiz_101",
  "resultType": "quiz",
  "createdBy": "usr_t_math",
  "inputMaterialId": null,
  "questionType": "true_false",
  "questionCount": 2,
  "isMock": true
}
```

### 생성된 T/F 검토 상세

`GET /api/v1/quizzes/quiz_101` → 200

응답:
```json
{
  "id": "quiz_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상) 확인문제",
  "status": "draft",
  "version": 1,
  "questionType": "true_false",
  "questions": [
    {
      "id": "quiz_101_q1",
      "position": 1,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (1)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    },
    {
      "id": "quiz_101_q2",
      "position": 2,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (2)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    }
  ],
  "questionCount": 2,
  "publishedAt": null,
  "inputMaterialId": null,
  "generationNo": 2,
  "createdBy": "usr_t_math",
  "createdAt": "2026-11-21T07:26:33.121011Z",
  "reviewedAt": null
}
```

### T/F 검토 완료

`POST /api/v1/quizzes/quiz_101/review` → 200

응답:
```json
{
  "id": "quiz_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상) 확인문제",
  "status": "reviewed",
  "version": 2,
  "questionType": "true_false",
  "questions": [
    {
      "id": "quiz_101_q1",
      "position": 1,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (1)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    },
    {
      "id": "quiz_101_q2",
      "position": 2,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (2)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    }
  ],
  "questionCount": 2,
  "publishedAt": null,
  "inputMaterialId": null,
  "generationNo": 2,
  "createdBy": "usr_t_math",
  "createdAt": "2026-11-21T07:26:33.121011Z",
  "reviewedAt": "2026-11-21T07:26:33.129214Z",
  "reviewedBy": "usr_t_math",
  "updatedAt": "2026-11-21T07:26:33.129223Z"
}
```

### T/F 학생 배포

`POST /api/v1/quizzes/quiz_101/publish` → 200

응답:
```json
{
  "id": "quiz_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상) 확인문제",
  "status": "published",
  "version": 3,
  "questionType": "true_false",
  "questions": [
    {
      "id": "quiz_101_q1",
      "position": 1,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (1)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    },
    {
      "id": "quiz_101_q2",
      "position": 2,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (2)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0,
      "correctOptionId": "1",
      "explanation": "가상 해설입니다. 원본의 첫 문장을 다시 읽어 보세요.",
      "sourceSentenceIds": [
        "s1"
      ]
    }
  ],
  "questionCount": 2,
  "publishedAt": "2026-11-21T07:26:33.134454Z",
  "inputMaterialId": null,
  "generationNo": 2,
  "createdBy": "usr_t_math",
  "createdAt": "2026-11-21T07:26:33.121011Z",
  "reviewedAt": "2026-11-21T07:26:33.129214Z",
  "reviewedBy": "usr_t_math",
  "updatedAt": "2026-11-21T07:26:33.134463Z",
  "publishedBy": "usr_t_math"
}
```

### 학생 T/F 두 보기와 지문

`GET /api/v1/quizzes/quiz_101` → 200

응답:
```json
{
  "id": "quiz_101",
  "classId": "cls_1",
  "sourceId": "src_math_1",
  "studentMemberId": "mem_s_a",
  "subject": "math",
  "title": "비와 비율 (가상) 확인문제",
  "status": "published",
  "version": 3,
  "questionType": "true_false",
  "questions": [
    {
      "id": "quiz_101_q1",
      "position": 1,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (1)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0
    },
    {
      "id": "quiz_101_q2",
      "position": 2,
      "questionType": "true_false",
      "prompt": "[가상 학습문제] 자료의 설명과 일치하는 것은 무엇인가요? (2)",
      "choices": [
        {
          "id": "1",
          "text": "맞아요"
        },
        {
          "id": "2",
          "text": "아니에요"
        }
      ],
      "maxPoints": 1.0
    }
  ],
  "questionCount": 2,
  "publishedAt": "2026-11-21T07:26:33.134454Z",
  "progress": {
    "quizId": "quiz_101",
    "questionCount": 2,
    "submittedQuestionCount": 0,
    "status": "not_started",
    "firstScore": null,
    "maxScore": 2.0,
    "firstCorrectCount": null,
    "latestCorrectCount": 0,
    "currentWrongCount": 0,
    "unansweredQuestionCount": 2,
    "retryCounts": {
      "quiz_101_q1": 0,
      "quiz_101_q2": 0
    },
    "wrongQuestions": []
  },
  "passage": {
    "paragraphs": [
      {
        "id": "s1",
        "text": "자료의 첫 문장입니다."
      }
    ]
  },
  "inputMaterialId": null,
  "generationNo": 2,
  "createdBy": "usr_t_math",
  "createdAt": "2026-11-21T07:26:33.121011Z",
  "reviewedAt": "2026-11-21T07:26:33.129214Z",
  "reviewedBy": "usr_t_math",
  "updatedAt": "2026-11-21T07:26:33.134463Z",
  "publishedBy": "usr_t_math"
}
```

### 마스킹된 교사 Solar 연결

`GET /api/v1/ai-credentials` → 200

응답:
```json
{
  "items": [
    {
      "id": "cred_t_math",
      "teacherId": "usr_t_math",
      "label": "가상 Solar 연결",
      "maskedSuffix": "demo",
      "status": "active",
      "provider": "solar",
      "isMock": true
    }
  ],
  "nextCursor": null
}
```

## 백엔드 구현 연결

DML88개와 기존DDL은 baseline/에 보존했습니다. 세션→users/user_sessions, 클래스→classes/class_memberships/class_invitations, 진단→진단6테이블, 생성→ai_credentials/ai_requests, 자료→files/source_materials/student_materials, 문제→quizzes/quiz_questions, 풀이→quiz_submissions/quiz_answer_attempts로 연결합니다.

교사 초대의 지정교과를 실제DB에 저장하려면 class_invitations의 교과컬럼을 추가하는 제안이 필요합니다. 이 파일묶음은 DB마이그레이션을 실행하지 않습니다. 진단70문항·PDF본문·AI응답은 합성 mock이며 공식문항/Solar응답으로 오인하지 않습니다.
