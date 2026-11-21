# 가나다계단 19개 화면 → API 연결표

기준 자료: 사용자 첨부 `가나다계단_개발자전달.zip`의 `HANDOFF.md`, 기존 MariaDB 20개 테이블 DDL 및 88개 SQL 블록 DML, 이후 사용자 확정 사항. 화면 이름과 프레임 ID는 첨부 설명서에서 확인했습니다.

피그마 파일: https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH

**1.1 추가 확인:** 실제 React 소스에서 교사 대시보드·교사 자료 목록·학생 대시보드 3개를 확인하고 ../frontend/ 수정본에 연결했습니다. 나머지 화면은 향후 구현 대상입니다. 원본 자료 카드(sourceId)에서 바로 전환본 상세(materialId)로 이동하면 안 되며, 학생별 결과 선택이 필요합니다.

**초기 확인 범위:** 이 문서는 첨부 화면 설명서를 읽어 작성한 데이터 연결 설계입니다. 작성 시 Figma 도구가 활성화되지 않았고, 직접 URL 읽기도 네트워크 프록시의 403 응답으로 차단되어 실제 프레임의 시각 요소·프로토타입을 열람하지 못했습니다. 아래 링크는 해당 화면을 사람이 확인할 수 있도록 연결한 것이며, 직접 화면을 열어 확인했다는 뜻이 아닙니다.

API 경로는 `/api/v1` 기준입니다. 최종 호출·필드 이름은 함께 제공하는 OpenAPI 명세를 기준으로 합니다. 테이블 ID는 API에서 문자열로 전달하여 JavaScript의 큰 정수 정밀도 문제를 피합니다.

## 화면별 데이터와 동작

| 화면 / 피그마 프레임 | 필요한 정보 | 연결할 API | 화면 구현 시 반영할 점 |
|---|---|---|---|
| [공통 01 로그인](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-148) | 로그인한 계정·실제 역할·다음 진행 단계 | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | 교사/학생 탭은 로그인 선택일 뿐 권한 부여 수단이 아님. 학생은 클래스 가입 필요 / 진단 필요 / 진단 진행 / 학습 가능 상태를 분리 |
| [교사 01 클래스 목록](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-2) | 본인 활성 클래스, 클래스별 담당 교과·소유자 여부 | `GET /classes`, `POST /classes`, `POST /invitations/accept` | 클래스 생성은 이름 외 학년·학년도·승인된 담당 교과가 필요. 교사 초대 교과는 소유자가 발급 시 지정하며 DB 최소 보완안이 필요. 교과는 계정 전체의 고정값이 아닌 클래스 소속 값 |
| [교사 02 클래스 대시보드](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-51) | 학생 수, 선택 영역의 수준 분포, 모국어, 진단 상태, 최근 자기 교과 문제의 첫 성적·현재 오답 수 | `GET /classes/{classId}/dashboard?area={area}`, `GET /classes/{classId}/students`, `POST /classes/{classId}/invitations` | 기본 표시 영역은 교사 담당 교과. 초급 미달·미완료를 누락하지 않음. 최근 문제 ‘점수’와 ‘정답 개수’를 구분. 학생 상세 미설계 상태를 숨기지 않음 |
| [교사 03 자료 목록](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-100) | 원본별 제목·교과·단원·생성일, 학생별 전환 상태 | `GET /classes/{classId}/sources`, `GET /classes/{classId}/materials` | 다른 교과 구역은 반환하지 않음. 원본 ID와 학생별 전환본 ID를 혼용하지 않음. 썸네일은 준비되지 않았으면 대체 카드 |
| [교사 04 새 자료 만들기](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-139) | PDF 등록 상태, 대상 학생 목록·진단 완료 여부, 교사 개인 AI 연결 | `POST /classes/{classId}/files`, `POST /classes/{classId}/sources`, `GET /classes/{classId}/students`, `POST /classes/{classId}/generation-jobs`, `GET /generation-jobs/{jobId}` | 서버가 담당 교과를 정함. 학생 여러 명은 학생별 작업/결과로 분리. 생성 대기·부분 실패·실패 재시도 화면 필요 |
| [교사 05 자료 검토](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-189) | 원본 본문·학생별 전환본·진단 스냅샷·검토 상태·수정 버전 | `GET /materials/{materialId}`, `PATCH /materials/{materialId}`, `POST /materials/{materialId}/review`, `POST /materials/{materialId}/publish` | 단순 버튼 한 번으로 무검토 배포하지 않음. 수정하면 검토 해제. 수준 묶음 탭의 기준 영역을 표시하고 초급 미달을 누락하지 않음 |
| [교사 06 문항 목록](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-245) | 학생별 문제 묶음 제목·문항 수·형식·상태·배포일 | `GET /classes/{classId}/quizzes`, `GET /quizzes/{quizId}` | 문항 묶음 수와 개별 문항 수를 구분. 원본을 볼 권한이 있어도 다른 학생 배정 정보를 학생에게 노출하지 않음 |
| [교사 07 새 문항 만들기](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-279) | PDF/원본 또는 학생별 전환본, 대상 학생, 문제 형식·문항 수 | `POST /classes/{classId}/files`, `POST /classes/{classId}/sources`, `POST /classes/{classId}/generation-jobs`, `GET /generation-jobs/{jobId}` | UI에 T/F·4지선다 선택이 필요. 원본 직접 출제와 전환본 출제를 구분. 진단 미완료 학생은 자동 생성 대상에서 제외하거나 명시적 오류 표시 |
| [교사 08 문항 검토](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-317) | 학생별 문항·보기·정답·해설·출처·검토 버전 | `GET /quizzes/{quizId}`, `PATCH /quizzes/{quizId}/questions/{questionId}`, `POST /quizzes/{quizId}/review`, `POST /quizzes/{quizId}/publish` | 교사 DTO에만 정답 포함. 변경 후 재검토. 배포한 문항은 덮어쓰지 않고 새 묶음 생성 |
| [교사 09 학생 수준](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=10-368) | 학생별 10개 파트·5개 영역종합, 진단 완료 여부, 최근 자기 교과 풀이 | `GET /classes/{classId}/students`, `GET /classes/{classId}/students/{memberId}/diagnostic`, `GET /classes/{classId}/activity` | 생활한국어 포함 5영역. 해당 클래스 학생 진단은 5영역 전체, 학습 문제 내역은 교사 담당 교과만 |
| [학생 01 진단 검사](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-191) | 고정 문항집 버전, 전체/완료 문항 수, 다음 문항, 음원·보기 | `POST /diagnostic/start`, `GET /diagnostic`, `GET /diagnostic/next-question`, `POST /diagnostic/answers` | 20문항으로 하드코딩하지 않음. 진행률은 서버 문항집 기준. 답안 저장 성공 후 다음 문제. 정답·판정 문항 메타데이터는 학생 응답에서 제외 |
| [학생 02 클래스 목록](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-237) | 본인이 참여한 클래스와 가입 상태 | `GET /classes`, `POST /invitations/accept` | 아직 클래스가 없으면 초대 가입을 먼저 제공. 진단 미완료여도 가입 화면에는 접근 가능하고 학습 기능은 제한 |
| [학생 03 내 대시보드](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-278) | 미제출 문제 수, 현재 오답 수, 새 배포 자료, 문제별 진행 상태, 선택 영역 수준 | `GET /classes/{classId}/dashboard?area=daily`, `GET /diagnostic/results` | ‘오늘 풀 문제’는 마감일/일정이 없어 ‘아직 풀지 않은 문제’가 정확함. 읽음 이력 없는 NEW는 최근7일 배포 의미로만 표시 |
| [학생 04 받은 자료 목록](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-323) | 본인에게 배포된 전환본, 교과 필터, 배포일 | `GET /classes/{classId}/materials` | 교사와 같은 경로여도 역할별 DTO/범위를 분리. 학생은 본인 배포본만 받고 초안·다른 학생 자료는 제외 |
| [학생 05 자료 보기](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-368) | 본인 배포 자료의 본문·허용 파일·저장된 번역 | `GET /materials/{materialId}`, `GET /files/{fileId}/download` | 단어장 기록 기능은 제외. 글자 크기는 브라우저 설정. 듣기·필기는 별도 구현 범위이며 이번 DB에 저장되는 기능으로 표현하지 않음 |
| [학생 06 문항 목록](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-412) | 본인 배포 문제 묶음, 총문항/최초응답/현재오답 수 | `GET /classes/{classId}/quizzes` | ‘모두 처음 응답함’과 ‘모두 정답임’을 구분. DB completed만으로 정답 완료 표시를 만들지 않음 |
| [학생 07 문제 풀기](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-444) | 지문·문항·2개 또는4개 보기, 다음 미응답/선택 재풀이 문제 | `GET /quizzes/{quizId}`, `POST /quizzes/{quizId}/answers` | 한 문항 제출당 저장. T/F는 보기2개. 중복 요청키로 재전송해도 제출 횟수 증가 금지. 이미 맞힌 문제의 오답 재풀이 거절 |
| [학생 08 결과](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-484) | 최초 정답 개수·최초 점수, 현재 오답, 문항별 재풀이 횟수 | `GET /quizzes/{quizId}/results`, `GET /quizzes/{quizId}/questions/{questionId}/explanation` | 재풀이 후 처음 점수는 보존. ‘다시 풀기’ 클릭 자체는 저장하지 않음. 해설은 해당 문항 첫 제출 후 조회 |
| [학생 09 진단 결과](https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH?node-id=11-529) | 5영역 각각 듣기·읽기·종합 등급 | `GET /diagnostic/results` | 3개 카드 위에 국어/수학/사회/과학/생활한국어 선택 필요(기본 생활한국어). 응답의 5영역 결과에서 선택해 표시. 전체 영역을 평균 내어 단일 듣기·읽기·종합 등급으로 만들지 않음 |

## 공통 영역과 미설계 상태

- 상단 사용자 이름/역할/모국어·접근 가능한 클래스는 로그인 세션 및 클래스 API에서 받습니다. 디자인 색·글꼴·아이콘은 API 데이터가 아닙니다.
- 검색은 우선 허용된 현재 클래스 자료/문제 목록의 검색 매개변수로 한정합니다. 전역 검색·알림함·알림 읽음 상태는 기존 계획과 테이블에 없으므로 별도 구현 완료 기능으로 표시하지 않습니다.
- 교사 사이드바의 ‘검토 기다리는 문항 N건’은 **미검토 문제 묶음 수**로 이름을 명확히 합니다. 개별 문제 수와 혼용하지 않습니다.
- 로딩은 비동기 작업 상태 queued/running/succeeded/failed/unknown을 표시합니다. 결과가 아직 없으면 빈 결과를 성공 생성으로 간주하지 않습니다.
- 배포 성공 후에는 해당 목록 또는 읽기 전용 상세로 이동하는 것을 제안합니다. 이는 원래 시안에서 미정인 화면 이동 결정이며 DB 구조를 바꾸지 않습니다.
- 자료 없음, 미배포, 진단 미완료, AI 키 없음/실패, 생성 일부 실패, 권한 없음, 수정 충돌은 서로 다른 화면 상태입니다.
- 파일 다운로드는 원본/전환본/진단 문항의 접근 권한을 먼저 검사합니다. 원본 파일 ID를 알고 있다는 이유만으로 학생에게 원본 PDF 전체를 공개하지 않습니다.

## 개발 시작 전 프론트 수정 목록

1. 교사 자료 목록의 ‘다른 교과’ 구역 제거.
2. 생활한국어 임시 대시(–)를 실제 결과로 표시하고 진단 미완료일 때만 미완료 표시.
3. 진단 결과·대시보드에 현재 표시 영역을 명시. 임의 전체 평균 등급 제거.
4. 수준 표시에서 초급 미달과 진단 미완료를 구분하고, 문제 생성에 T/F 선택을 추가.
5. 학생 자료 보기의 단어장 저장 버튼 제거 또는 미지원 기능으로 숨김. 듣기/필기는 별도 범위 결정.
6. 재풀이 횟수는 제출 성공 응답으로 갱신. 클릭 시 로컬 숫자를 먼저 증가시키지 않음.
7. 진단 문항 수·점수·정답 개수·NEW 의미를 서버 데이터에 맞춰 표시.
