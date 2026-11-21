# API 계약을 기존 DML에 연결할 때 필요한 보완

이 문서는 이후 실제 백엔드 구현 시 적용할 제안입니다. 이번 작업에서 DB를 변경하지 않았습니다. 기존20개 테이블과 DML 스냅샷은 baseline/에 그대로 보존했습니다.

## 여러 학생 선택과 멱등키

API의 generation-jobs는 학생 여러 명을 받지만 DB의 ai_requests는 학생 한 명당 한 행입니다. 새 배치 테이블이 이미 있는 것으로 가정하지 않습니다.

- 요청 헤더 Idempotency-Key는 최대64자입니다. 입력 본문은 정규화하여 별도 SHA-256 해시로 비교합니다.
- 요청 범위는 실행 교사+클래스+작업 endpoint+부모 요청키입니다. 같은 범위의 재전송에 다른 학생목록/옵션을 넣으면409입니다.
- 학생별 DB idempotency_key는 `SHA256(교사ID|클래스ID|작업종류|부모요청키|학생소속ID)`의64자리 hex로 만들 수 있습니다. 직렬화는 구분자 혼동이 없는 정규 JSON 배열 등으로 고정합니다.
- 부모 키·범위·본문 해시·선택 학생목록은 아래 요청 스냅샷의 request에 함께 저장합니다. 재전송에서는 해당 부모키/범위의 기존 행을 먼저 검색하여 본문 해시가 같은지 확인한 후 기존 자식 작업들을 반환합니다. 학생목록을 바꾸어 새 자식 해시를 만든 뒤 중복검사를 생략하면 안 됩니다.
- 새 요청의 전체 학생별 행 저장은 하나의 트랜잭션입니다. 교사 또는 클래스 잠금 등으로 같은 요청의 동시 생성을 직렬화하고 UNIQUE(teacher_id,idempotency_key)를 마지막 방어선으로 둡니다.
- 작업 실행의 성공/실패는 학생별로 독립입니다. 일부 실패를 전체 성공으로 합치지 않습니다. 같은 요청 재전송으로 Solar를 재호출하지 않습니다.

작은 초기 서비스에서는 JSON 필터로 부모 요청을 찾을 수 있습니다. 요청량이 커지면 생성 컬럼·인덱스 또는 별도 요청 테이블을 검토해야 합니다. 이 최적화는 현재DDL에 자동 반영된 기능이 아닙니다.

## 대기 작업을 재시작해도 입력이 남아 있어야 함

현재 ai_requests에는 questionType/questionCount 독립 컬럼이 없습니다. 기존 profile_snapshot JSON을 다음 구조로 확장하는 안을 제안합니다.

```json
{
  "studentProfile": {
    "nativeLanguage": "zh",
    "formId": "진단 문항집 ID",
    "parts": ["실제10개 점수/수준 객체"],
    "areas": ["실제5개 점수/수준 객체"]
  },
  "request": {
    "parentIdempotencyKey": "요청 헤더 값",
    "scope": "교사·클래스·작업 범위",
    "bodyHash": "정규화 본문의 SHA-256",
    "studentMemberIds": ["선택 학생 ID"],
    "questionType": "true_false",
    "questionCount": 2
  }
}
```

배열 안의 설명 문자열은 구조 설명용이며 실제 저장 시 결과 객체를 넣습니다. student_materials.diagnosis_snapshot에는 studentProfile만 추출하여 저장하도록 기존 DML의 직접 복사 부분을 조정합니다. 다른 안은 별도 request_options JSON 컬럼 추가입니다. 이번안은 테이블/컬럼을 새로 만들지 않고 기존JSON 구조를 명확히 하는 제안입니다.

요청에는 기존DDL의 credential_id·source_material_id·target_student_member_id·input_student_material_id·model·prompt_version도 함께 저장합니다. 교사의 다른 활성 키가 생겼다고 실행 중인 요청의 키를 자동 교체하지 않습니다. 해당 요청에 고정된 키가 취소되면 작업을 실패/보류 처리합니다. mock도 credentialId를 고정합니다.

## 버전과 ETag

mock의 version은 프로세스 안 정수입니다. 기존DDL에 version 컬럼이 있는 것은 아닙니다. 실제서비스에서는 기존 updated_at(DATETIME(6)) 또는 콘텐츠해시로 불투명한 ETag를 만들어 If-Match와 비교할 수 있습니다. 클라이언트는 ETag를 정수로 해석하지 말고 응답 헤더 값을 그대로 돌려보내야 합니다.

부모 자료/문제 행을 잠근 상태에서 검토 대상 본문과 버전을 비교합니다. 문항 자식 행을 수정할 때도 부모 quizzes.updated_at을 갱신해야 합니다. 처리량이나 시계 해상도에 대한 더 강한 보장이 필요하면 별도 row_version 컬럼 추가를 검토합니다.

## 교사 초대의 교과

현재 초대테이블은 역할만 저장합니다. 자동가입시 교과를 확정하려면 class_invitations.teacher_subject_code nullable컬럼을 추가하고 teacher초대에서는 필수·student초대에서는NULL 제약을 두는 최소변경을 권합니다. 초대를 발급하는 소유자만 정하고 수락자는 바꾸지 못하게 합니다. 현재DDL을 유지한다면 DML문서에 적힌 소유자 승인 절차를 별도로 구현해야 합니다.

## 상태와 이름 변환

- API 원본sourceId → source_material_id, 전환본materialId → student_materials.id, 문제quizId → quizzes.id.
- API studentMemberId는 users.id가 아닌 class_memberships.id입니다.
- API content → converted_content, version/ETag → updated_at 비교, profile → snapshot.
- 요청의 nextAction, 대시보드집계, NEW표시, 정답개수·최신오답수는 조회/계산값입니다. 화면마다 새DB테이블을 만들지 않습니다.
- 단어장·필기저장·알림·전역검색·학생AI는 현재 계약에서 지원하지 않습니다.
