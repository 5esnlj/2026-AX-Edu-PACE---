-- 가나다계단 / MariaDB 11.8 / 전체 파일을 처음부터 실행하세요.
-- ganada DB의 신규 테이블 20개 생성용. 기존 테이블/데이터 삭제 없음.
-- 기존 테이블이 있으면 재실행하지 말고 생성 상태를 먼저 확인하세요.
-- 교과별 권한은 서버에서 02_authorized_queries.sql 조건도 적용해야 합니다.

SET NAMES utf8mb4;
SET SESSION time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS ganada
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ganada;

-- 01. 교사/학생 공통 계정
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login_id VARCHAR(100) NOT NULL,
  role ENUM('teacher','student') NOT NULL,
  password_hash VARCHAR(255) NOT NULL COMMENT 'Argon2id 등 비밀번호 해시',
  display_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NULL,
  native_language_code VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  teacher_verified_at DATETIME(6) NULL,
  status ENUM('pending','active','suspended','deleted') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_login (login_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_id_role (id, role),
  CONSTRAINT ck_users_login CHECK (CHAR_LENGTH(TRIM(login_id)) > 0),
  CONSTRAINT ck_users_name CHECK (CHAR_LENGTH(TRIM(display_name)) > 0),
  CONSTRAINT ck_users_teacher_verify CHECK (role = 'teacher' OR teacher_verified_at IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='역할 선택 화면과 별개로 서버에서 실제 계정 역할을 확인';

-- 02. 로그인 세션: 원문 토큰 대신 SHA-256 등 32바이트 해시 저장
CREATE TABLE user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NULL,
  revoked_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY ix_sessions_user (user_id, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_sessions_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 03. 반/집단 단위 클래스. 여러 교사가 참여하되 소유자는 한 명.
-- API 키는 클래스 공용이 아니라 요청 교사 개인 연결에서 선택합니다.
CREATE TABLE classes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_teacher_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  grade_label VARCHAR(80) NOT NULL,
  academic_year SMALLINT UNSIGNED NOT NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  archived_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY ix_classes_owner (owner_teacher_id, status),
  CONSTRAINT fk_classes_owner FOREIGN KEY (owner_teacher_id) REFERENCES users(id),
  CONSTRAINT ck_classes_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_classes_year CHECK (academic_year BETWEEN 2000 AND 2200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='교과는 클래스가 아니라 교사 소속과 수업자료에 저장';

-- 04. 교사·학생 공통 소속. 교사는 담당 교과 1개 필수, 학생은 NULL.
-- 클래스 소유자도 teacher 소속을 생성해야 하며, 소유자에게 교과 제한 예외는 주지 않습니다.
CREATE TABLE class_memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('teacher','student') NOT NULL,
  teacher_subject_code ENUM('korean','math','social','science','daily') NULL,
  invitation_id BIGINT UNSIGNED NULL,
  roster_number VARCHAR(30) NULL,
  status ENUM('active','left','removed') NOT NULL DEFAULT 'active',
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  left_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_members_class_user (class_id, user_id),
  UNIQUE KEY uq_members_id_class (id, class_id),
  KEY ix_members_user_status (user_id, status, class_id),
  KEY ix_members_teacher_subject (class_id, role, status, teacher_subject_code),
  CONSTRAINT fk_members_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_members_user_role FOREIGN KEY (user_id, role) REFERENCES users(id, role),
  CONSTRAINT ck_members_subject CHECK (
    (role = 'teacher' AND teacher_subject_code IS NOT NULL AND roster_number IS NULL)
    OR (role = 'student' AND teacher_subject_code IS NULL)
  ),
  CONSTRAINT ck_members_left CHECK (status <> 'active' OR left_at IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='자료 조회는 활성 교사 소속과 teacher_subject_code 일치가 모두 필요';

-- 05. 교사 공유 초대 / 학생 가입 초대
CREATE TABLE class_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL,
  invited_role ENUM('teacher','student') NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  max_uses INT UNSIGNED NOT NULL DEFAULT 1,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  revoked_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invite_token (token_hash),
  UNIQUE KEY uq_invite_id_class_role (id, class_id, invited_role),
  KEY ix_invite_class_expiry (class_id, expires_at),
  CONSTRAINT fk_invite_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_invite_creator FOREIGN KEY (class_id, created_by_user_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT ck_invite_counts CHECK (max_uses >= 1 AND used_count <= max_uses),
  CONSTRAINT ck_invite_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE class_memberships
  ADD CONSTRAINT fk_members_invitation FOREIGN KEY (invitation_id, class_id, role)
    REFERENCES class_invitations(id, class_id, invited_role);

-- 06. 비공개 파일. 실제 PDF/음원 바이트는 객체 저장소에 보관.
CREATE TABLE files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  object_key VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('source_pdf','converted_file','diagnostic_audio','diagnostic_image') NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 BINARY(32) NOT NULL,
  scan_status ENUM('pending','clean','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_object (object_key),
  KEY ix_files_uploader (uploaded_by_user_id, created_at),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
  CONSTRAINT ck_files_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='파일 다운로드도 참조 자료의 클래스·교과 또는 학생 배정 권한을 검사';

-- 07. 최초 진단 문항집/규칙 버전. 학생의 진단 회차가 아님.
CREATE TABLE diagnostic_forms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
  rules_json JSON NOT NULL,
  source_reference VARCHAR(500) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  published_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_diag_form_version (version),
  CONSTRAINT ck_diag_form_rules CHECK (JSON_TYPE(rules_json) = 'OBJECT'),
  CONSTRAINT ck_diag_form_published CHECK (status <> 'published' OR published_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 08. 정답이 고정된 진단 문항. 5영역×듣기/읽기 각100점 구성.
CREATE TABLE diagnostic_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  form_id BIGINT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  source_code VARCHAR(64) NOT NULL,
  area ENUM('korean','math','social','science','daily') NOT NULL,
  skill ENUM('listening','reading') NOT NULL,
  tier ENUM('beginner','intermediate','advanced') NOT NULL,
  gate_slot TINYINT UNSIGNED NULL COMMENT '각 난도 판정 문항 1/2. 추가 점수 문항은 NULL',
  prompt JSON NOT NULL,
  options JSON NOT NULL COMMENT '보기 배열: [{"id":"1","text":"..."}, ...]',
  correct_option_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  max_points DECIMAL(5,2) NOT NULL,
  audio_file_id BIGINT UNSIGNED NULL,
  image_file_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_diag_q_form_sequence (form_id, sequence_no),
  UNIQUE KEY uq_diag_q_id_form (id, form_id),
  UNIQUE KEY uq_diag_q_gate (form_id, area, skill, tier, gate_slot),
  CONSTRAINT fk_diag_q_form FOREIGN KEY (form_id) REFERENCES diagnostic_forms(id),
  CONSTRAINT fk_diag_q_audio FOREIGN KEY (audio_file_id) REFERENCES files(id),
  CONSTRAINT fk_diag_q_image FOREIGN KEY (image_file_id) REFERENCES files(id),
  CONSTRAINT ck_diag_q_sequence CHECK (sequence_no >= 1),
  CONSTRAINT ck_diag_q_gate CHECK (gate_slot IS NULL OR gate_slot IN (1,2)),
  CONSTRAINT ck_diag_q_points CHECK (max_points > 0 AND max_points <= 100),
  CONSTRAINT ck_diag_q_options CHECK (JSON_TYPE(options) = 'ARRAY' AND JSON_LENGTH(options) >= 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='정답 ID가 options 안에 있는지·보기 중복·각 파트 총100점은 공개 전 서버 검증';

-- 09. 학생 계정당 최초 진단 한 번. 다른 클래스 가입 시에도 재생성하지 않음.
CREATE TABLE student_diagnostics (
  student_id BIGINT UNSIGNED NOT NULL,
  form_id BIGINT UNSIGNED NOT NULL,
  origin_class_id BIGINT UNSIGNED NOT NULL,
  status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  PRIMARY KEY (student_id),
  UNIQUE KEY uq_diag_student_form (student_id, form_id),
  CONSTRAINT fk_diag_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_diag_state_form FOREIGN KEY (form_id) REFERENCES diagnostic_forms(id),
  CONSTRAINT fk_diag_origin_member FOREIGN KEY (origin_class_id, student_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT ck_diag_completed CHECK (
    (status = 'in_progress' AND completed_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT ck_diag_times CHECK (completed_at IS NULL OR completed_at >= started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. 제출 완료한 선택 답안. NULL 선택지=명시적인 모르겠어요, 행 없음=미제출.
CREATE TABLE diagnostic_answers (
  student_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  form_id BIGINT UNSIGNED NOT NULL,
  selected_option_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (student_id, question_id),
  CONSTRAINT fk_diag_answer_state FOREIGN KEY (student_id, form_id)
    REFERENCES student_diagnostics(student_id, form_id),
  CONSTRAINT fk_diag_answer_question FOREIGN KEY (question_id, form_id)
    REFERENCES diagnostic_questions(id, form_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='같은 답 재전송은 중복 저장하지 않음. 기존 답을 덮어쓰지 않도록 서버 처리';

-- 11. 파트10행. 식별 키 외에는 점수·최종 수준만 저장.
CREATE TABLE diagnostic_part_results (
  student_id BIGINT UNSIGNED NOT NULL,
  area ENUM('korean','math','social','science','daily') NOT NULL,
  skill ENUM('listening','reading') NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  level_code ENUM('below_beginner','beginner','intermediate','advanced') NOT NULL,
  PRIMARY KEY (student_id, area, skill),
  CONSTRAINT fk_part_result_student FOREIGN KEY (student_id) REFERENCES student_diagnostics(student_id),
  CONSTRAINT ck_part_result_score CHECK (score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='파트 최종수준은 고정 정답과 루브릭으로 계산. 판단 근거 저장 없음';

-- 12. 영역종합5행. 같은 영역 듣기+읽기 점수, 식별 키 외에는 점수·최종 수준만.
CREATE TABLE diagnostic_area_results (
  student_id BIGINT UNSIGNED NOT NULL,
  area ENUM('korean','math','social','science','daily') NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  level_code ENUM('below_beginner','beginner','intermediate','advanced') NOT NULL,
  PRIMARY KEY (student_id, area),
  CONSTRAINT fk_area_result_student FOREIGN KEY (student_id) REFERENCES student_diagnostics(student_id),
  CONSTRAINT ck_area_result_score CHECK (score BETWEEN 0 AND 200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='합계80/140 경계·동일영역 한파트30미만 규칙은 서버 계산';

-- 13. 교사 개인 Solar 연결. 암호화 키는 DB 밖 Secret Manager 등에 보관.
CREATE TABLE ai_credentials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(100) NOT NULL DEFAULT 'Solar',
  encrypted_secret VARBINARY(4096) NOT NULL COMMENT '인증 암호화 결과; 원문 API 키 금지',
  key_version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  masked_suffix VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending','active','failed','revoked') NOT NULL DEFAULT 'pending',
  last_checked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  revoked_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_credential_owner (id, teacher_id),
  KEY ix_ai_credentials_teacher (teacher_id, status),
  CONSTRAINT fk_ai_credential_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. 교사 원본 자료. subject_code가 담당 교과 조회 제한의 기준.
CREATE TABLE source_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  source_file_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  subject_code ENUM('korean','math','social','science','daily') NOT NULL,
  unit VARCHAR(150) NOT NULL DEFAULT '',
  source_text LONGTEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  archived_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_source_id_class (id, class_id),
  KEY ix_source_class_subject (class_id, subject_code, archived_at, created_at),
  KEY ix_source_creator (created_by_user_id, created_at),
  CONSTRAINT fk_source_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_source_creator_member FOREIGN KEY (class_id, created_by_user_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_source_file FOREIGN KEY (source_file_id) REFERENCES files(id),
  CONSTRAINT ck_source_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT ck_source_text CHECK (CHAR_LENGTH(TRIM(source_text)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공개 후 원문 불변. 교과 일치 검사를 목록/상세/파일/AI 요청에 동일 적용';

-- 15. 교사만 실행하는 AI 작업. 원본 PDF 직접 출제와 전환본 출제를 모두 지원.
CREATE TABLE ai_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  credential_id BIGINT UNSIGNED NOT NULL,
  source_material_id BIGINT UNSIGNED NOT NULL,
  target_student_member_id BIGINT UNSIGNED NOT NULL,
  input_student_material_id BIGINT UNSIGNED NULL,
  operation ENUM('convert','generate_quiz') NOT NULL,
  status ENUM('queued','running','succeeded','failed','unknown') NOT NULL DEFAULT 'queued',
  idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  profile_snapshot JSON NOT NULL COMMENT '언어·진단 점수/수준15개와 form. 판단 근거 제외',
  model VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  prompt_version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  input_tokens BIGINT UNSIGNED NULL,
  output_tokens BIGINT UNSIGNED NULL,
  safe_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  finished_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_request_idempotency (teacher_id, idempotency_key),
  UNIQUE KEY uq_ai_request_context (id, class_id, source_material_id, target_student_member_id),
  KEY ix_ai_request_queue (status, created_at),
  CONSTRAINT fk_ai_request_teacher_member FOREIGN KEY (class_id, teacher_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_ai_request_credential_owner FOREIGN KEY (credential_id, teacher_id)
    REFERENCES ai_credentials(id, teacher_id),
  CONSTRAINT fk_ai_request_source FOREIGN KEY (source_material_id, class_id)
    REFERENCES source_materials(id, class_id),
  CONSTRAINT fk_ai_request_student FOREIGN KEY (target_student_member_id, class_id)
    REFERENCES class_memberships(id, class_id),
  CONSTRAINT ck_ai_request_input CHECK (operation <> 'convert' OR input_student_material_id IS NULL),
  CONSTRAINT ck_ai_request_snapshot CHECK (JSON_TYPE(profile_snapshot) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. 학생별 전환본 + 검토/배포 상태. 교사별 작성/검토/배포 주체 구분.
CREATE TABLE student_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL COMMENT '복합 FK로 다른 클래스 혼입 방지',
  source_material_id BIGINT UNSIGNED NOT NULL,
  student_member_id BIGINT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL,
  ai_request_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  converted_content JSON NOT NULL,
  diagnosis_snapshot JSON NOT NULL,
  converted_file_id BIGINT UNSIGNED NULL,
  status ENUM('draft','reviewed','published','withdrawn') NOT NULL DEFAULT 'draft',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  published_by_user_id BIGINT UNSIGNED NULL,
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_material_revision (source_material_id, student_member_id, revision),
  UNIQUE KEY uq_student_material_ai (ai_request_id),
  UNIQUE KEY uq_student_material_context (id, class_id, source_material_id, student_member_id),
  KEY ix_student_material_inbox (student_member_id, status, published_at),
  CONSTRAINT fk_student_material_source FOREIGN KEY (source_material_id, class_id)
    REFERENCES source_materials(id, class_id),
  CONSTRAINT fk_student_material_member FOREIGN KEY (student_member_id, class_id)
    REFERENCES class_memberships(id, class_id),
  CONSTRAINT fk_student_material_request FOREIGN KEY (ai_request_id, class_id, source_material_id, student_member_id)
    REFERENCES ai_requests(id, class_id, source_material_id, target_student_member_id),
  CONSTRAINT fk_student_material_creator FOREIGN KEY (class_id, created_by_user_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_student_material_reviewer FOREIGN KEY (class_id, reviewed_by_user_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_student_material_publisher FOREIGN KEY (class_id, published_by_user_id)
    REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_student_material_file FOREIGN KEY (converted_file_id) REFERENCES files(id),
  CONSTRAINT ck_student_material_revision CHECK (revision >= 1),
  CONSTRAINT ck_student_material_json CHECK (JSON_TYPE(converted_content) = 'OBJECT' AND JSON_TYPE(diagnosis_snapshot) = 'OBJECT'),
  CONSTRAINT ck_student_material_review_pair CHECK ((reviewed_by_user_id IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT ck_student_material_publish_pair CHECK ((published_by_user_id IS NULL) = (published_at IS NULL)),
  CONSTRAINT ck_student_material_reviewed CHECK (status NOT IN ('reviewed','published') OR reviewed_at IS NOT NULL),
  CONSTRAINT ck_student_material_published CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT ck_student_material_publish_review CHECK (published_at IS NULL OR (reviewed_at IS NOT NULL AND published_at >= reviewed_at)),
  CONSTRAINT ck_student_material_draft CHECK (status <> 'draft' OR (reviewed_at IS NULL AND published_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE ai_requests
  ADD CONSTRAINT fk_ai_request_input_material
    FOREIGN KEY (input_student_material_id, class_id, source_material_id, target_student_member_id)
    REFERENCES student_materials(id, class_id, source_material_id, student_member_id);

-- 17. 학생·자료별 문제 묶음. 전환본 없이 원본 PDF에서 직접 출제 가능.
CREATE TABLE quizzes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL,
  source_material_id BIGINT UNSIGNED NOT NULL,
  student_member_id BIGINT UNSIGNED NOT NULL,
  student_material_id BIGINT UNSIGNED NULL,
  ai_request_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  generation_no INT UNSIGNED NOT NULL,
  question_type ENUM('true_false','multiple_choice_4') NOT NULL,
  source_hash BINARY(32) NOT NULL,
  status ENUM('draft','reviewed','published','withdrawn') NOT NULL DEFAULT 'draft',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  published_by_user_id BIGINT UNSIGNED NULL,
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_quiz_generation (source_material_id, student_member_id, generation_no),
  UNIQUE KEY uq_quiz_request (ai_request_id),
  UNIQUE KEY uq_quiz_id_type (id, question_type),
  KEY ix_quiz_inbox (student_member_id, status, published_at),
  KEY ix_quiz_class_published (class_id, status, published_at),
  CONSTRAINT fk_quiz_source FOREIGN KEY (source_material_id, class_id) REFERENCES source_materials(id, class_id),
  CONSTRAINT fk_quiz_student FOREIGN KEY (student_member_id, class_id) REFERENCES class_memberships(id, class_id),
  CONSTRAINT fk_quiz_student_material FOREIGN KEY (student_material_id, class_id, source_material_id, student_member_id)
    REFERENCES student_materials(id, class_id, source_material_id, student_member_id),
  CONSTRAINT fk_quiz_ai_request FOREIGN KEY (ai_request_id, class_id, source_material_id, student_member_id)
    REFERENCES ai_requests(id, class_id, source_material_id, target_student_member_id),
  CONSTRAINT fk_quiz_creator FOREIGN KEY (class_id, created_by_user_id) REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_quiz_reviewer FOREIGN KEY (class_id, reviewed_by_user_id) REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT fk_quiz_publisher FOREIGN KEY (class_id, published_by_user_id) REFERENCES class_memberships(class_id, user_id),
  CONSTRAINT ck_quiz_generation CHECK (generation_no >= 1),
  CONSTRAINT ck_quiz_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT ck_quiz_review_pair CHECK ((reviewed_by_user_id IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT ck_quiz_publish_pair CHECK ((published_by_user_id IS NULL) = (published_at IS NULL)),
  CONSTRAINT ck_quiz_reviewed CHECK (status NOT IN ('reviewed','published') OR reviewed_at IS NOT NULL),
  CONSTRAINT ck_quiz_published CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT ck_quiz_publish_review CHECK (published_at IS NULL OR (reviewed_at IS NOT NULL AND published_at >= reviewed_at)),
  CONSTRAINT ck_quiz_draft CHECK (status <> 'draft' OR (reviewed_at IS NULL AND published_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. AI 생성 학습 문제. 해설은 진단 판단 근거와 다른 학습 콘텐츠입니다.
CREATE TABLE quiz_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  question_type ENUM('true_false','multiple_choice_4') NOT NULL,
  prompt TEXT NOT NULL,
  choices JSON NOT NULL,
  correct_option_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  explanation TEXT NOT NULL,
  source_sentence_ids JSON NOT NULL,
  max_points DECIMAL(6,2) NOT NULL DEFAULT 1.00,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quiz_question_position (quiz_id, position),
  UNIQUE KEY uq_quiz_question_id_quiz (id, quiz_id),
  CONSTRAINT fk_quiz_question_type FOREIGN KEY (quiz_id, question_type) REFERENCES quizzes(id, question_type),
  CONSTRAINT ck_quiz_question_position CHECK (position >= 1),
  CONSTRAINT ck_quiz_question_choices CHECK (
    JSON_TYPE(choices) = 'ARRAY' AND (
      (question_type = 'true_false' AND JSON_LENGTH(choices) = 2)
      OR (question_type = 'multiple_choice_4' AND JSON_LENGTH(choices) = 4)
    )
  ),
  CONSTRAINT ck_quiz_question_sources CHECK (JSON_TYPE(source_sentence_ids) = 'ARRAY' AND JSON_LENGTH(source_sentence_ids) >= 1),
  CONSTRAINT ck_quiz_question_points CHECK (max_points > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. 문제 묶음별 풀이 상태. completed는 최초로 모든 문항에 답했다는 뜻.
CREATE TABLE quiz_submissions (
  quiz_id BIGINT UNSIGNED NOT NULL,
  status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  first_submitted_at DATETIME(6) NULL,
  first_score DECIMAL(10,2) NULL,
  max_score DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (quiz_id),
  CONSTRAINT fk_quiz_submission_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
  CONSTRAINT ck_quiz_submission_max CHECK (max_score > 0),
  CONSTRAINT ck_quiz_submission_score CHECK (first_score IS NULL OR (first_score >= 0 AND first_score <= max_score)),
  CONSTRAINT ck_quiz_submission_state CHECK (
    (status = 'in_progress' AND first_submitted_at IS NULL AND first_score IS NULL)
    OR (status = 'completed' AND first_submitted_at IS NOT NULL AND first_score IS NOT NULL)
  ),
  CONSTRAINT ck_quiz_submission_times CHECK (first_submitted_at IS NULL OR first_submitted_at >= started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='최초 성적은 재풀이로 덮어쓰지 않음. 실제 학생은 quizzes.student_member_id에서 유도';

-- 20. 문항별 여러 제출. 재풀이수=유효 제출수-1, 첫 제출 attempt_no=1.
CREATE TABLE quiz_answer_attempts (
  quiz_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  attempt_no INT UNSIGNED NOT NULL,
  selected_option_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points DECIMAL(6,2) NOT NULL,
  request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  answered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (quiz_id, question_id, attempt_no),
  UNIQUE KEY uq_quiz_answer_request (quiz_id, request_key),
  KEY ix_quiz_answer_activity (quiz_id, answered_at),
  CONSTRAINT fk_quiz_answer_submission FOREIGN KEY (quiz_id) REFERENCES quiz_submissions(quiz_id),
  CONSTRAINT fk_quiz_answer_question FOREIGN KEY (question_id, quiz_id) REFERENCES quiz_questions(id, quiz_id),
  CONSTRAINT ck_quiz_answer_attempt CHECK (attempt_no >= 1),
  CONSTRAINT ck_quiz_answer_correct CHECK (is_correct IN (0,1)),
  CONSTRAINT ck_quiz_answer_points CHECK (points >= 0 AND (is_correct = 1 OR points = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='서버에서 배정 학생·직전 오답·선택지·채점·연속 attempt_no를 검사';

-- 모든 FK의 삭제/갱신 동작은 기본 RESTRICT/NO ACTION입니다.
-- 자료·답안·진단 결과를 일괄 CASCADE 삭제하지 않습니다.
-- 아래 조회 결과가20인지 확인하세요. 실제 입력 데이터는 생성하지 않습니다.
SELECT COUNT(*) AS created_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';
