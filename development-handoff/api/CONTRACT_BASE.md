# API 설계 기준 (협업용 확정 초안)

Scope: existing MariaDB 20 tables + 2026-11-21 DML, attachment HANDOFF 19 screens. Build mock/test/spec only, not production backend or frontend changes. Every fixture is synthetic. Figma direct access not yet available; cite exact frame links from HANDOFF, do not claim visual inspection.

Base `/api/v1`, JSON camelCase, IDs strings (e.g. `cls_1`, `usr_t_math`, `mem_s_a`, `src_math_1`). Single resources direct JSON; lists `{items:[],nextCursor:null}`. Error `{code,message,requestId,details}`. BigInt DB IDs serialized strings in real adapter. Levels below_beginner/beginner/intermediate/advanced; areas korean/math/social/science/daily. Domain-selected diagnosis summaries, never one overall made-up grade. Scores part100/aggregate200.

Sessions: POST /auth/login `{loginId,password,role}`; cookie session + `csrfToken` response, `/auth/me`, POST `/auth/logout`. Mutating authenticated calls need X-CSRF-Token (mock uses local cookie secure=false; production secure=true). login-selected role must match actual account. Password fixtures mock only.

Routes contract (backend may add clearly documented helpers; coordinate with root):
- GET /health (no provider credentials)
- POST /auth/login, GET /auth/me, POST /auth/logout
- GET /classes, POST /classes
- POST /classes/{classId}/invitations, POST /invitations/accept
- GET /classes/{classId}/dashboard?area=math
- GET /classes/{classId}/students; GET /classes/{classId}/students/{memberId}/diagnostic
- GET /diagnostic; POST /diagnostic/start; GET /diagnostic/next-question; POST /diagnostic/answers `{questionId,selectedOptionId}`; GET /diagnostic/results
- POST /classes/{classId}/files (multipart PDF), GET /files/{fileId}/download
- POST /classes/{classId}/sources `{fileId,title,unit}`; GET /classes/{classId}/sources; GET /sources/{sourceId}
- POST /classes/{classId}/generation-jobs `{sourceId,studentMemberIds,operation:convert|generate_quiz,inputMaterialId?,questionType:true_false|multiple_choice_4?,questionCount?}` (Idempotency-Key required, 202 response items per-student jobs); GET /generation-jobs/{jobId}
- GET /classes/{classId}/materials; GET /materials/{materialId}; PATCH /materials/{materialId}; POST /materials/{materialId}/review; POST /materials/{materialId}/publish
- GET /classes/{classId}/quizzes; GET /quizzes/{quizId}; PATCH /quizzes/{quizId}/questions/{questionId}; POST /quizzes/{quizId}/review; POST /quizzes/{quizId}/publish
- POST /quizzes/{quizId}/answers `{questionId,selectedOptionId}` with Idempotency-Key; GET /quizzes/{quizId}/results; GET /quizzes/{quizId}/questions/{questionId}/explanation
- GET /classes/{classId}/activity (teacher own subject)
- GET /ai-credentials (masked only), POST /ai-credentials (do not persist/expose plaintext; mock check deterministic and never call Solar), POST /ai-credentials/{credentialId}/check, DELETE /ai-credentials/{credentialId} (logical revocation).

Concurrency: modifying content and review/publish require `If-Match` resource version; stale ->412, missing ->428. Each student gets own material/quiz/job; grouping tabs are display grouping by source subject's diagnostic aggregate, not shared student content. Published content immutable ->409; edit resets review. Permission gates on every direct ID/list/download/result: teacher active class membership+own subject, owner no subject bypass; own key; student own published assigned content and diagnosis completed except join/diagnostic routes. Unsupported subject query rejected or empty; must never widen scope.

Answers: fixed option IDs; student never receives answer key/explanation before first submission; unsubmitted != wrong, retries=count persisted submissions-1, last correct cannot retry. Idempotency same payload replay no extra attempt; same key different payload409. firstScore/firstCorrectCount vs latestCorrectCount/currentWrongCount distinct. `completed`=all first answers, not all correct. Diagnostic account once pinned form, next missing answer, duplicate same answer replay, differing answer409, out-of-order409, NULL explicit dontknow. Runtime questionCount, no fixed20. Exactly10part+5aggregate results. Gate scoring as DML. Interrupted resumes. Incomplete student cannot call learning routes.

Dashboard counts: sets vs questions explicit. Teacher ownsubject count; include belowBeginner,notDiagnosed separate. Student sidebar selectedArea explicit default daily. NEW=isRecentPublished (last7days), not unread. Unit number/thumbnail nullable, no fake DB column. Search/notifications/vocabulary/notes/TTS persist are not current scope (capabilities false); no ghost endpoints.

Teacher invite subject: DDL currently has no invitation subject. Design API accepts teacherSubject only by class owner, mock stores it; mark proposed minimal DDL delta `class_invitations.teacher_subject_code NULL` before production, NOT silently implemented DB. Students cannot self-assign subject. This addition does not add tables. Student invitation works with existing DML. Missing teacherSubject ->422. Invitation roles/expiry/maxUses transactional concept.

Mock deterministic in-memory reset on restart; fixture users t_math/t_science/t_outside and students s_a(zh),s_b(vi),s_pending(unfinished),s_new(no class) with simple documented mock-only password. Seed crossclass/crosssubject resources for deny tests. Synthetic fixed diagnosis70questions (10parts*7, weights5,5,15,15,15,15,30) explicitly only fixture, not official instrument. Generation can complete deterministically on first job poll; no real PDF extraction/Solar/DB. Explain any mock limitations; never claim production authorization complete.
