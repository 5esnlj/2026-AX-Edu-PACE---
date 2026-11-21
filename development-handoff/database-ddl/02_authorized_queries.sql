-- 가나다계단 / MariaDB 11.8 / 서버 구현용 조회 예시
-- 이 파일은 테이블을 변경하지 않습니다. 각 -- query: 구간을 별도 조회로 사용하세요.
-- @authenticated_user_id는 요청 본문에서 받지 말고 로그인 세션에서 서버가 결정합니다.
-- 나머지 ID도 prepared statement의 바인딩 매개변수로 전달하세요.
-- HeidiSQL의 @변수는 예시를 실행하기 위한 수단이지 웹앱 인증 수단이 아닙니다.
-- 자료 식별자로 바로 접근해도 목록과 같은 권한 검사를 반드시 수행합니다.
-- 결과가 없으면 서버는 접근을 거절합니다. UI에서 항목을 숨기는 것만으로는 부족합니다.

USE ganada;
SET NAMES utf8mb4;
SET @authenticated_user_id = NULL;
SET @class_id = NULL;
SET @source_material_id = NULL;
SET @student_material_id = NULL;
SET @quiz_id = NULL;
SET @file_id = NULL;

-- query: teacher_source_list
-- 1. 해당 클래스에서 담당 교과가 같은 원본 자료만 조회.
-- 다른 교사가 만든 같은 교과 자료는 포함합니다. 소유자에게도 교과 예외는 없습니다.
SELECT s.id, s.title, s.subject_code, s.unit, s.created_by_user_id, s.created_at
FROM source_materials AS s
JOIN classes AS c ON c.id = s.class_id AND c.status = 'active'
JOIN class_memberships AS teacher
  ON teacher.class_id = s.class_id
 AND teacher.user_id = @authenticated_user_id
 AND teacher.role = 'teacher' AND teacher.status = 'active'
 AND teacher.teacher_subject_code = s.subject_code
JOIN users AS actor
  ON actor.id = teacher.user_id AND actor.role = 'teacher'
 AND actor.status = 'active' AND actor.teacher_verified_at IS NOT NULL
WHERE s.class_id = @class_id AND s.archived_at IS NULL
ORDER BY s.created_at DESC, s.id DESC
LIMIT 100;
-- endquery

-- query: teacher_source_detail
-- 2. 원본 상세도 같은 교과 조건 적용. ID만으로 SELECT하지 않습니다.
SELECT s.id, s.class_id, s.title, s.subject_code, s.unit, s.source_text,
       s.source_file_id, s.created_by_user_id
FROM source_materials AS s
JOIN classes AS c ON c.id = s.class_id AND c.status = 'active'
JOIN class_memberships AS teacher
  ON teacher.class_id = s.class_id
 AND teacher.user_id = @authenticated_user_id
 AND teacher.role = 'teacher' AND teacher.status = 'active'
 AND teacher.teacher_subject_code = s.subject_code
JOIN users AS actor
  ON actor.id = teacher.user_id AND actor.role = 'teacher'
 AND actor.status = 'active' AND actor.teacher_verified_at IS NOT NULL
WHERE s.id = @source_material_id AND s.class_id = @class_id
  AND s.archived_at IS NULL;
-- endquery

-- query: teacher_converted_detail
-- 3. 학생별 전환본 상세도 원본의 교과를 기준으로 접근 제한.
SELECT m.id, m.source_material_id, m.student_member_id, m.revision,
       m.status, m.converted_content, m.converted_file_id, m.published_at
FROM student_materials AS m
JOIN source_materials AS s ON s.id = m.source_material_id AND s.class_id = m.class_id
JOIN classes AS c ON c.id = s.class_id AND c.status = 'active'
JOIN class_memberships AS teacher
  ON teacher.class_id = s.class_id
 AND teacher.user_id = @authenticated_user_id
 AND teacher.role = 'teacher' AND teacher.status = 'active'
 AND teacher.teacher_subject_code = s.subject_code
JOIN users AS actor
  ON actor.id = teacher.user_id AND actor.role = 'teacher'
 AND actor.status = 'active' AND actor.teacher_verified_at IS NOT NULL
WHERE m.id = @student_material_id AND m.class_id = @class_id
  AND s.archived_at IS NULL;
-- endquery

-- query: teacher_quiz_detail
-- 4. 교사용 문항/정답/해설 검토 조회. 학생에게 이 응답을 보내지 않습니다.
SELECT q.id AS quiz_id, q.title, q.status, q.student_member_id,
       item.id AS question_id, item.position, item.question_type,
       item.prompt, item.choices, item.correct_option_id, item.explanation
FROM quizzes AS q
JOIN source_materials AS s ON s.id = q.source_material_id AND s.class_id = q.class_id
JOIN classes AS c ON c.id = s.class_id AND c.status = 'active'
JOIN class_memberships AS teacher
  ON teacher.class_id = s.class_id
 AND teacher.user_id = @authenticated_user_id
 AND teacher.role = 'teacher' AND teacher.status = 'active'
 AND teacher.teacher_subject_code = s.subject_code
JOIN users AS actor
  ON actor.id = teacher.user_id AND actor.role = 'teacher'
 AND actor.status = 'active' AND actor.teacher_verified_at IS NOT NULL
JOIN quiz_questions AS item ON item.quiz_id = q.id
WHERE q.id = @quiz_id AND q.class_id = @class_id AND s.archived_at IS NULL
ORDER BY item.position;
-- endquery

-- query: teacher_file_download
-- 5. 파일 ID 직접 입력 방지. 객체 저장소 경로는 이 검사 후 서버 내부에서만 사용.
-- 조건 통과 후 파일을 스트리밍하거나 짧은 만료시간의 다운로드 URL을 발급합니다.
-- 공개 버킷/영구 공개 링크를 사용하면 이 검사로 파일 접근을 제한할 수 없습니다.
WITH permitted_sources AS (
  SELECT s.id
  FROM source_materials AS s
  JOIN classes AS c ON c.id = s.class_id AND c.status = 'active'
  JOIN class_memberships AS teacher
    ON teacher.class_id = s.class_id
   AND teacher.user_id = @authenticated_user_id
   AND teacher.role = 'teacher' AND teacher.status = 'active'
   AND teacher.teacher_subject_code = s.subject_code
  JOIN users AS actor
    ON actor.id = teacher.user_id AND actor.role = 'teacher'
   AND actor.status = 'active' AND actor.teacher_verified_at IS NOT NULL
  WHERE s.class_id = @class_id AND s.archived_at IS NULL
)
SELECT f.id, f.object_key, f.original_name, f.mime_type
FROM files AS f
WHERE f.id = @file_id AND f.scan_status = 'clean' AND f.deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM source_materials AS s
      JOIN permitted_sources AS p ON p.id = s.id
      WHERE s.source_file_id = f.id
    )
    OR EXISTS (
      SELECT 1 FROM student_materials AS m
      JOIN permitted_sources AS p ON p.id = m.source_material_id
      WHERE m.converted_file_id = f.id
    )
  );
-- endquery

-- query: student_material_list
-- 6. 학생은 교과와 관계없이 본인에게 배포된 전환본만 조회.
SELECT m.id, s.title, s.subject_code, m.revision, m.published_at
FROM student_materials AS m
JOIN source_materials AS s ON s.id = m.source_material_id AND s.class_id = m.class_id
JOIN classes AS c ON c.id = m.class_id AND c.status = 'active'
JOIN class_memberships AS student
  ON student.id = m.student_member_id AND student.class_id = m.class_id
 AND student.user_id = @authenticated_user_id
 AND student.role = 'student' AND student.status = 'active'
JOIN users AS actor
  ON actor.id = student.user_id AND actor.role = 'student' AND actor.status = 'active'
WHERE m.class_id = @class_id AND m.status = 'published' AND s.archived_at IS NULL
ORDER BY FIELD(s.subject_code, 'korean','math','social','science','daily'),
         m.published_at DESC, m.id DESC;
-- endquery

-- query: student_quiz_questions
-- 7. 학생용 문제 상세. 정답/해설은 최초 제출 전 응답에서 제외.
-- 원본 직접 출제는 student_material_id=NULL 허용.
-- 전환본 기반 문제는 전환본도 배포된 상태여야 하며, 출제 지문도 같이 제공합니다.
SELECT q.id AS quiz_id, q.title, item.id AS question_id, item.position,
       item.question_type, item.prompt, item.choices, item.max_points,
       CASE WHEN q.student_material_id IS NULL THEN s.source_text ELSE NULL END AS original_passage,
       m.converted_content AS converted_passage
FROM quizzes AS q
JOIN source_materials AS s ON s.id = q.source_material_id AND s.class_id = q.class_id
JOIN classes AS c ON c.id = q.class_id AND c.status = 'active'
JOIN class_memberships AS student
  ON student.id = q.student_member_id AND student.class_id = q.class_id
 AND student.user_id = @authenticated_user_id
 AND student.role = 'student' AND student.status = 'active'
JOIN users AS actor
  ON actor.id = student.user_id AND actor.role = 'student' AND actor.status = 'active'
LEFT JOIN student_materials AS m ON m.id = q.student_material_id
JOIN quiz_questions AS item ON item.quiz_id = q.id
WHERE q.id = @quiz_id AND q.class_id = @class_id
  AND q.status = 'published' AND s.archived_at IS NULL
  AND (q.student_material_id IS NULL OR m.status = 'published')
ORDER BY item.position;
-- endquery

-- query: diagnostic_next_question
-- 8. 진단 재접속: 제출 기록이 없는 첫 문제. 총 진행률도 답안 행 수로 계산합니다.
-- NULL 선택지로 제출한 '모르겠어요'도 완료 문항이므로 건너뜁니다.
-- 정상 흐름에서는 서버가 이 문항만 제출받고 저장한 뒤 다음 문제를 반환합니다.
-- 진단 상태는 계정 단위이므로 클래스마다 새 회차를 만들지 않습니다.
SELECT item.id, item.sequence_no, item.area, item.skill,
       item.prompt, item.options, item.audio_file_id, item.image_file_id
FROM student_diagnostics AS d
JOIN users AS actor
  ON actor.id = d.student_id AND actor.role = 'student' AND actor.status = 'active'
JOIN diagnostic_questions AS item ON item.form_id = d.form_id
LEFT JOIN diagnostic_answers AS a
  ON a.student_id = d.student_id AND a.question_id = item.id AND a.form_id = d.form_id
WHERE d.student_id = @authenticated_user_id AND d.status = 'in_progress'
  AND a.question_id IS NULL
  AND EXISTS (
    SELECT 1 FROM class_memberships AS member
    JOIN classes AS c ON c.id = member.class_id AND c.status = 'active'
    WHERE member.user_id = d.student_id AND member.role = 'student' AND member.status = 'active'
  )
ORDER BY item.sequence_no
LIMIT 1;
-- endquery

-- query: teacher_quiz_progress
-- 9. 교과 제한을 적용한 문항별 첫 성적/현재 정오/재풀이 횟수.
-- 풀이 이력이 없으면 latest_is_correct=NULL(미제출), retry_count=0.
WITH permitted_quiz AS (
  SELECT q.id
  FROM quizzes AS q
  JOIN source_materials AS s ON s.id = q.source_material_id AND s.class_id = q.class_id
  JOIN classes AS c ON c.id = q.class_id AND c.status = 'active'
  JOIN class_memberships AS teacher
    ON teacher.class_id = q.class_id
   AND teacher.user_id = @authenticated_user_id
   AND teacher.role = 'teacher' AND teacher.status = 'active'
   AND teacher.teacher_subject_code = s.subject_code
  JOIN users AS actor
    ON actor.id = teacher.user_id AND actor.role = 'teacher'
   AND actor.status = 'active' AND actor.teacher_verified_at IS NOT NULL
  WHERE q.id = @quiz_id AND q.class_id = @class_id AND s.archived_at IS NULL
), ranked_answers AS (
  SELECT a.quiz_id, a.question_id, a.is_correct, a.answered_at,
         COUNT(*) OVER (PARTITION BY a.quiz_id, a.question_id) AS submission_count,
         ROW_NUMBER() OVER (PARTITION BY a.quiz_id, a.question_id ORDER BY a.attempt_no DESC) AS rn
  FROM quiz_answer_attempts AS a
  JOIN permitted_quiz AS p ON p.id = a.quiz_id
)
SELECT item.id AS question_id, item.position,
       submission.first_score, submission.max_score, submission.first_submitted_at,
       recent.is_correct AS latest_is_correct, recent.answered_at AS last_answered_at,
       COALESCE(recent.submission_count - 1, 0) AS retry_count
FROM permitted_quiz AS p
JOIN quiz_questions AS item ON item.quiz_id = p.id
LEFT JOIN quiz_submissions AS submission ON submission.quiz_id = p.id
LEFT JOIN ranked_answers AS recent
  ON recent.quiz_id = p.id AND recent.question_id = item.id AND recent.rn = 1
ORDER BY item.position;
-- endquery

-- 추가 구현 조건(README 참고):
-- • 자료/문제 생성·검토·배포·AI 실행에도 위 교사 권한 조건을 적용합니다.
-- • 학생 파일 다운로드는 본인에게 배포된 student_material 또는 quiz를 통해서만 허용합니다.
-- • 학생 해설은 본인에게 배포된 문항이며 최소 한 번 제출한 경우에만 반환합니다.
-- • 진단 음원/이미지는 현재 진단의 허용된 문항을 통해 접근합니다.
-- • 초안 수정/검토/배포는 교과 조건 + (작성자 또는 클래스 소유자) 정책을 권장합니다.
-- • 담당 교과 변경 권한을 일반 교사에게 임의로 주지 않습니다.
