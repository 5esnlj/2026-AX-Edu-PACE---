import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .agents import DemoLearningAgent, SAMPLE_TEXT, assess

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)

@contextmanager
def connect(path: str):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def initialize(path: str):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS students (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL,
          grade TEXT NOT NULL, levels TEXT NOT NULL, everyday INTEGER NOT NULL,
          diagnostic_source TEXT NOT NULL DEFAULT 'sample'
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY, role TEXT NOT NULL, student_id TEXT REFERENCES students(id), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS l1_profiles (
          student_id TEXT PRIMARY KEY REFERENCES students(id), profile TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS materials (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL, unit TEXT NOT NULL,
          source_text TEXT NOT NULL, modes TEXT NOT NULL, targets TEXT NOT NULL,
          variants TEXT NOT NULL, reviewed TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS quizzes (
          id TEXT PRIMARY KEY, material_id TEXT NOT NULL UNIQUE REFERENCES materials(id), questions TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS translation_reviews (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, material_id TEXT REFERENCES materials(id),
          document_text TEXT NOT NULL, parameters TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id TEXT NOT NULL REFERENCES quizzes(id),
          student_id TEXT NOT NULL REFERENCES students(id), result TEXT NOT NULL,
          is_sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learning (
          student_id TEXT NOT NULL REFERENCES students(id), material_id TEXT NOT NULL REFERENCES materials(id),
          notes TEXT NOT NULL DEFAULT '', known TEXT NOT NULL DEFAULT '[]', unknown TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL, PRIMARY KEY(student_id, material_id)
        );
        CREATE TABLE IF NOT EXISTS progress (
          student_id TEXT NOT NULL REFERENCES students(id), step_id TEXT NOT NULL,
          completed_at TEXT NOT NULL, PRIMARY KEY(student_id, step_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL REFERENCES students(id),
          sender TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS invitations (
          code TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
        );
        """)
        # One-way migration requested by the user: discard 1–4 scores, never rescale them.
        columns = {r[1] for r in db.execute("PRAGMA table_info(students)")}
        if "level_scale" not in columns:
            db.execute("ALTER TABLE students ADD COLUMN level_scale TEXT NOT NULL DEFAULT 'legacy_1_4'")
        if "diagnostic_summary" not in columns:
            db.execute("ALTER TABLE students ADD COLUMN diagnostic_summary TEXT")
        db.execute("UPDATE students SET levels=?,everyday=0,diagnostic_source='unassessed',level_scale='diagnostic_1_6',diagnostic_summary=NULL WHERE level_scale='legacy_1_4'", (dumps(dict.fromkeys(['listening','speaking','reading','writing'], 0)),))
        db.execute("DELETE FROM l1_profiles WHERE json_extract(profile, '$.level_scale')='app_1_4'")
        # Drop embedded four-level scores in old material snapshots as well; keep lesson content.
        for row in db.execute("SELECT id,variants FROM materials").fetchall():
            variants = json.loads(row["variants"])
            changed = False
            for variant in variants.values():
                if variant.get("level_scale") != "diagnostic_1_6":
                    variant.update(level=0, level_scale="diagnostic_1_6")
                    changed = True
                reconstruction = variant.get("reconstruction", {})
                if reconstruction.get("profile_context", {}).get("level_scale") == "app_1_4":
                    reconstruction["profile_context"].update(source="app", level_scale="diagnostic_1_6", bottlenecks=[], daily_korean_support=None)
                    reconstruction["learner_decision"].update(diagnosed_level=None, skill_profile=dict.fromkeys(['listening','reading','writing','speaking']), subject_profile_used={}, rationale=["새 6수준 진단 전입니다. 이 자료의 본문은 기존 검토본입니다."])
                    for term in reconstruction.get("vocabulary", []):
                        term["learner_level"] = None
                    reconstruction["warnings"] = [w for w in reconstruction.get("warnings", []) if "1~4" not in w]
                    changed = True
            if changed:
                db.execute("UPDATE materials SET variants=? WHERE id=?", (dumps(variants), row["id"]))
        db.executescript("""
        CREATE TABLE IF NOT EXISTS diagnostic_attempts (
          id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), state TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS diagnostic_audio (
          attempt_id TEXT NOT NULL REFERENCES diagnostic_attempts(id), question_id TEXT NOT NULL,
          mime_type TEXT NOT NULL, content BLOB NOT NULL, PRIMARY KEY(attempt_id,question_id)
        );
        CREATE TABLE IF NOT EXISTS learning_paths (
          id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), fingerprint TEXT NOT NULL,
          result TEXT NOT NULL, progress TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS student_materials (
          id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id),
          title TEXT NOT NULL, subject TEXT NOT NULL, source_text TEXT NOT NULL,
          profile TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL,
          completed_at TEXT, quiz TEXT, attempt TEXT, created_at TEXT NOT NULL
        );
        """)
        from .diagnosis.seed_example import seed_student_example
        if db.execute("SELECT count(*) FROM students").fetchone()[0]:
            seed_student_example(db)
            return
        identities = [("std-1", "누리", "vi"), ("std-2", "티무르", "uz"),
                      ("std-3", "사라", "en"), ("std-4", "나란", "mn"),
                      ("std-5", "아린", "bn"), ("std-6", "민준", "vi")]
        students = [(sid, name, language, dict.fromkeys(['listening','speaking','reading','writing'], 0), 0)
                    for sid, name, language in identities]
        for sid, name, language, levels, everyday in students:
            db.execute("INSERT INTO students(id,name,language,grade,levels,everyday,level_scale,diagnostic_source) VALUES(?,?,?,?,?,?,'diagnostic_1_6','unassessed')", (sid, name, language, "중학교 1학년 · 3반", dumps(levels), everyday))
        agent = DemoLearningAgent()
        targets = [s[0] for s in students]
        variants = {sid: agent.reconstruct(SAMPLE_TEXT, levels["reading"], language, ["easy", "bilingual", "visual"]) for sid, _, language, levels, _ in students}
        db.execute("INSERT INTO materials VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("lesson-demo", "민주주의, 우리 함께 만들어 가요", "사회", "민주주의와 시민 참여", SAMPLE_TEXT, dumps(["easy", "bilingual", "visual"]), dumps(targets), dumps(variants), dumps(targets), "published", now()))
        questions = agent.questions(SAMPLE_TEXT)
        db.execute("INSERT INTO quizzes VALUES(?,?,?,?)", ("quiz-demo", "lesson-demo", dumps(questions), now()))
        # Synthetic historical attempts, explicitly tagged and hidden from std-1's current exercise.
        for sid, answers in [("std-2", {"q1": 1, "q2": 0, "q3": 0, "q4": 1}), ("std-3", {"q1": 0, "q2": 1, "q3": 2, "q4": 0}), ("std-4", {"q1": 1, "q2": 1, "q3": 0, "q4": 0})]:
            db.execute("INSERT INTO attempts(quiz_id,student_id,result,is_sample,created_at) VALUES(?,?,?,?,?)", ("quiz-demo", sid, dumps(assess(questions, answers)), 1, now()))
        db.execute("INSERT INTO messages(student_id,sender,content,created_at) VALUES(?,?,?,?)", ("std-1", "teacher", "누리야, 오늘은 민주주의에 대해 함께 배워요. 낯선 단어는 눌러서 단어장에 모아 보세요. 천천히 읽어도 괜찮아요!", now()))
        seed_student_example(db)
