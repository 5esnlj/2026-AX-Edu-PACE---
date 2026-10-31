"""Import the explicitly requested PDF example once, without invented answers."""

import json
from pathlib import Path
from ..database import dumps, now
from .scoring import evaluate
from ..l3.workflow import fingerprint, normalize, request_for, rule_plan


def seed_student_example(db):
    data = json.loads(
        (Path(__file__).parent / "student_example.json").read_text(encoding="utf-8")
    )
    sid = data["student"]["id"]
    if db.execute("SELECT 1 FROM students WHERE id=?", (sid,)).fetchone():
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
