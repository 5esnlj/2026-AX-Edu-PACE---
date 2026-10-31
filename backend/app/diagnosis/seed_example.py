"""Import the explicitly requested PDF example once, without invented answers."""

import json
from pathlib import Path
from ..database import dumps, now
from .scoring import evaluate
from ..l3.workflow import fingerprint, normalize, request_for, rule_plan


def update_confirmed_language(db, data):
    """Apply the user's language correction once, preserving subsequent edits."""
    key = "student-a-confirmed-chinese-v1"
    db.execute("CREATE TABLE IF NOT EXISTS data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
    if db.execute("SELECT 1 FROM data_migrations WHERE id=?", (key,)).fetchone():
        return
    sid = data["student"]["id"]
    db.execute("UPDATE students SET language='zh' WHERE id=?", (sid,))
    row = db.execute("SELECT profile FROM l1_profiles WHERE student_id=?", (sid,)).fetchone()
    if row:
        profile = json.loads(row["profile"])
        profile["native_language"] = "중국어"
        db.execute("UPDATE l1_profiles SET profile=?,updated_at=? WHERE student_id=?", (dumps(profile), now(), sid))
    # Correct only the old provenance note, never scores, responses or diagnosis dates.
    row = db.execute("SELECT state FROM diagnostic_attempts WHERE id='diag-pdf-student-a' AND student_id=?", (sid,)).fetchone()
    if row:
        state = json.loads(row["state"])
        source = state.get("source") or {}
        if "모국어는 미확인입니다." in source.get("description", ""):
            source["description"] = data["assessment"]["source"]["description"]
            db.execute("UPDATE diagnostic_attempts SET state=? WHERE id='diag-pdf-student-a'", (dumps(state),))
    db.execute("INSERT INTO data_migrations VALUES(?,?)", (key, now()))


def seed_student_example(db):
    data = json.loads(
        (Path(__file__).parent / "student_example.json").read_text(encoding="utf-8")
    )
    sid = data["student"]["id"]
    if db.execute("SELECT 1 FROM students WHERE id=?", (sid,)).fetchone():
        update_confirmed_language(db, data)
        return  # Never reset subsequent assessments or learning records on restart.
    state = data["assessment"]
    result = evaluate(state)
    timestamp = now()
    student = data["student"]
    db.execute(
        "INSERT INTO students(id,name,language,grade,levels,everyday,diagnostic_source,level_scale,diagnostic_summary) VALUES(?,?,?,?,?,0,?,?,?)",
        (
            sid,
            student["name"],
            student["language"],
            student["grade"],
            dumps({d: v["level"] for d, v in result["domains"].items()}),
            "imported_example",
            "diagnostic_1_6",
            dumps(result),
        ),
    )
    db.execute(
        "INSERT INTO diagnostic_attempts VALUES(?,?,?,?,?)",
        ("diag-pdf-student-a", sid, dumps(state), timestamp, timestamp),
    )
    plan = normalize(rule_plan(result), request_for(result), "demo")
    db.execute(
        "INSERT INTO learning_paths(id,student_id,fingerprint,result,created_at) VALUES(?,?,?,?,?)",
        ("path-pdf-student-a", sid, fingerprint(result), dumps(plan), timestamp),
    )
    update_confirmed_language(db, data)
