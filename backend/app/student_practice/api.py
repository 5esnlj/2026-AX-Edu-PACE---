import json
import secrets

from fastapi import Depends, HTTPException
from pydantic import ValidationError

from ..agents import LANGUAGES
from ..database import connect, dumps, now
from ..l1.workflow import split_sentences
from ..solar_agent import SolarAgentError
from .models import GenerateInput, Answers
from .workflow import demo_generate, normalize, public_quiz, grade


def register(app, path, learner, find_student, find_material, agent):
    def find(db, qid, sid):
        row = db.execute("SELECT * FROM student_practice WHERE id=? AND student_id=?", (qid, sid)).fetchone()
        if not row:
            raise HTTPException(404, "나의 이해 확인 문제를 찾지 못했습니다.")
        return row

    def present(row):
        return {"id": row["id"], "title": row["title"], "source_kind": row["source_kind"],
                "source_id": row["source_id"], "question_type": row["question_type"],
                "provider": row["provider"], "notice": row["notice"],
                "quiz": public_quiz(json.loads(row["quiz"])),
                "attempt": json.loads(row["attempt"]) if row["attempt"] else None,
                "created_at": row["created_at"]}

    @app.get("/api/student-practice")
    def listing(auth=Depends(learner)):
        with connect(path) as db:
            return [present(row) for row in db.execute(
                "SELECT * FROM student_practice WHERE student_id=? ORDER BY created_at DESC LIMIT 100", (auth["student_id"],))]

    @app.post("/api/student-practice", status_code=201)
    def generate(data: GenerateInput, auth=Depends(learner)):
        if not data.learning_completed or not data.opt_in:
            raise HTTPException(409, "학습자료를 읽고 문제 만들기를 선택해 주세요.")
        sid = auth["student_id"]
        with connect(path) as db:
            student = find_student(db, sid)
            if data.source_kind == "material":
                item = find_material(db, data.source_id, auth)
                title = item["title"]
                source = item["variants"][sid]["text"]
            elif data.source_kind == "student_material":
                row = db.execute("SELECT title,result FROM student_materials WHERE id=? AND student_id=?", (data.source_id, sid)).fetchone()
                if not row:
                    raise HTTPException(404, "나의 학습자료를 찾지 못했습니다.")
                title = row["title"]
                # Use exactly what was learned, independently of later profile changes.
                source = "\n".join(s["rewritten"] for s in json.loads(row["result"])["sentences"])
            else:
                title = data.title or "나의 학습자료 문제"
                source = data.source_text
        if not 20 <= len(source) <= 40000:
            raise HTTPException(422, "학습자료를 20~40,000자로 넣어 주세요.")
        sentences = split_sentences(source)
        if not sentences or len(sentences) > 100 or any(len(s["source"]) > 3500 for s in sentences):
            raise HTTPException(422, "문장 사이에 줄바꿈을 넣고 100문장 이하로 나누어 주세요.")
        # Diagnosis is optional context, never a prerequisite or a stale snapshot gate.
        request = {"source_sentences": sentences, "question_type": data.question_type,
                   "learner_profile": {"diagnosis": student.get("diagnostic_summary"),
                                       "reading_level": student["levels"].get("reading") or None,
                                       "native_language": LANGUAGES.get(student["language"]) if student["language"] != "und" else None}}
        provider = getattr(agent, "provider", "demo")
        try:
            output = agent.generate_practice(request) if provider == "solar" else demo_generate(request)
            quiz = normalize(output, request)
        except SolarAgentError as exc:
            raise HTTPException(exc.status_code, str(exc)) from None
        except (ValueError, ValidationError):
            raise HTTPException(422, "선택한 문제 형식이나 학습자료 근거를 확인하지 못했습니다. 자료를 나누어 다시 시도해 주세요.") from None
        notice = ("학습자료에 근거한 AI 이해 확인 문제입니다. 의문이 있는 문항은 선생님과 확인해 주세요."
                  if provider == "solar" else "규칙 기반 체험 문제입니다. O/X는 문장 확인, 4지선다는 빈칸 낱말 확인 예시이며 실제 AI 생성은 Solar 연결 후 사용할 수 있습니다.")
        if not student.get("diagnostic_summary"):
            notice += " 진단 전에도 자료 내용으로 연습할 수 있으며 한국어 수준을 추정하지 않습니다."
        qid = "practice-" + secrets.token_hex(8)
        with connect(path) as db:
            db.execute("INSERT INTO student_practice(id,student_id,title,source_kind,source_id,source_snapshot,profile,question_type,provider,notice,quiz,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                       (qid, sid, title, data.source_kind, data.source_id, dumps(sentences), dumps(request["learner_profile"]), data.question_type, provider, notice, dumps(quiz), now()))
            return present(find(db, qid, sid))

    @app.get("/api/student-practice/{qid}")
    def detail(qid: str, auth=Depends(learner)):
        with connect(path) as db:
            return present(find(db, qid, auth["student_id"]))

    @app.post("/api/student-practice/{qid}/submit")
    def submit(qid: str, data: Answers, auth=Depends(learner)):
        with connect(path) as db:
            row = find(db, qid, auth["student_id"])
            if row["attempt"]:
                return json.loads(row["attempt"])
            try:
                result = dict(grade(json.loads(row["quiz"]), data.answers), created_at=now())
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from None
            db.execute("UPDATE student_practice SET attempt=? WHERE id=? AND attempt IS NULL", (dumps(result), qid))
            return json.loads(find(db, qid, auth["student_id"])["attempt"])
