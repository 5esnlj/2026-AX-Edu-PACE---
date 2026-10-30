import io
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, StrictInt, field_validator
from pypdf import PdfReader
from contextlib import asynccontextmanager

from .agents import LANGUAGES, SUBJECTS, GLOSSARY, SAMPLE_TEXT, ROADMAP, LearningAgent, DemoLearningAgent, assess, public_questions
from .database import connect, dumps, initialize, now
from .solar_agent import SolarAgentError, SolarLearningAgent

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
MAX_UPLOAD = 10 * 1024 * 1024

class Login(BaseModel):
    role: Literal["teacher", "student"]
    student_id: str = "std-1"

class MaterialInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subject: Literal["사회", "과학", "수학", "국어"]
    unit: str = Field(default="", max_length=100)
    source_text: str = Field(min_length=20, max_length=40000)
    targets: list[str] = Field(min_length=1, max_length=50)
    modes: list[Literal["easy", "bilingual", "visual"]] = Field(min_length=1, max_length=3)

    @field_validator("title", "source_text")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("내용을 입력해 주세요.")
        return value.strip()

class ReviewInput(BaseModel):
    student_id: str
    text: str = Field(min_length=10, max_length=40000)
    confirmed: bool
    translations: dict[str, str] = Field(default_factory=dict, max_length=100)

class Answers(BaseModel):
    answers: dict[str, StrictInt]

class LearningInput(BaseModel):
    notes: str = Field(default="", max_length=10000)
    known: list[str] = Field(default_factory=list, max_length=100)
    unknown: list[str] = Field(default_factory=list, max_length=100)

class Diagnostic(BaseModel):
    listening: int = Field(ge=1, le=4)
    speaking: int = Field(ge=1, le=4)
    reading: int = Field(ge=1, le=4)
    writing: int = Field(ge=1, le=4)
    everyday: int = Field(ge=1, le=4)

class MessageInput(BaseModel):
    student_id: str
    content: str = Field(min_length=1, max_length=2000)

class GlossaryInput(BaseModel):
    language: Literal["vi", "en", "uz", "mn", "bn"]
    entries: list[dict[str, str]] = Field(min_length=1, max_length=30)

class Exercise(BaseModel):
    answer: int = Field(ge=0, le=2)

def student_dict(row):
    result = dict(row)
    result["levels"] = json.loads(result["levels"])
    result["academic"] = round(sum(result["levels"].values()) / 4, 1)
    return result

def material_dict(row, student_id=None):
    result = dict(row)
    for key in ["modes", "targets", "variants", "reviewed"]:
        result[key] = json.loads(result[key])
    if student_id:
        result["variants"] = {student_id: result["variants"][student_id]}
        result["targets"] = [student_id]
        result["reviewed"] = [student_id] if student_id in result["reviewed"] else []
    return result

def create_app(db_path: str | None = None, learning_agent: LearningAgent | None = None):
    path = db_path or os.getenv("IEUM_DB_PATH", str(ROOT / ".data" / "ieum.db"))
    demo_enabled = os.getenv("IEUM_DEMO_ENABLED", "true").lower() == "true"

    @asynccontextmanager
    async def lifespan(_app):
        initialize(path)
        yield

    app = FastAPI(title="이음 Learning API", version="0.1.0", lifespan=lifespan)
    if learning_agent is not None:
        agent = learning_agent
    elif os.getenv("IEUM_AGENT_PROVIDER", "demo").lower() == "solar":
        agent = SolarLearningAgent()
    else:
        agent = DemoLearningAgent()

    @app.middleware("http")
    async def same_origin_mutations(request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
            from urllib.parse import urlparse
            if urlparse(origin).netloc != request.headers.get("host"):
                from fastapi.responses import JSONResponse
                return JSONResponse({"detail": "다른 출처의 변경 요청은 허용되지 않습니다."}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def session(request: Request):
        token = request.cookies.get("ieum_session", "")
        with connect(path) as db:
            row = db.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not row or datetime.fromisoformat(row["created_at"]) < datetime.now(timezone.utc) - timedelta(days=1):
            raise HTTPException(401, "데모에 다시 입장해 주세요.")
        return dict(row)

    def teacher(auth=Depends(session)):
        if auth["role"] != "teacher":
            raise HTTPException(403, "교사 전용 기능입니다.")
        return auth

    def learner(auth=Depends(session)):
        if auth["role"] != "student":
            raise HTTPException(403, "학생 전용 기능입니다.")
        return auth

    def find_student(db, sid):
        row = db.execute("SELECT * FROM students WHERE id=?", (sid,)).fetchone()
        if not row:
            raise HTTPException(404, "학생을 찾을 수 없습니다.")
        return student_dict(row)

    def find_material(db, mid, auth):
        row = db.execute("SELECT * FROM materials WHERE id=?", (mid,)).fetchone()
        if not row or (auth["role"] == "student" and (row["status"] != "published" or auth["student_id"] not in json.loads(row["targets"]))):
            raise HTTPException(404, "자료를 찾을 수 없습니다.")
        return material_dict(row, auth["student_id"] if auth["role"] == "student" else None)

    @app.get("/api/health")
    def health():
        with connect(path) as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok", "provider": getattr(agent, "provider", "custom"), "demo_enabled": demo_enabled}

    @app.get("/api/demo")
    def demo():
        if not demo_enabled:
            raise HTTPException(404, "데모가 비활성화되어 있습니다.")
        with connect(path) as db:
            students = [dict(r) for r in db.execute("SELECT id,name,language FROM students")]
        return {"students": students, "languages": LANGUAGES, "subjects": SUBJECTS, "sample_text": SAMPLE_TEXT}

    @app.post("/api/demo/session")
    def login(data: Login, response: Response):
        if not demo_enabled:
            raise HTTPException(403, "데모가 비활성화되어 있습니다. 운영 인증 어댑터가 필요합니다.")
        token = secrets.token_urlsafe(32)
        with connect(path) as db:
            if data.role == "student":
                find_student(db, data.student_id)
            db.execute("DELETE FROM sessions WHERE created_at < ?", ((datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),))
            db.execute("INSERT INTO sessions VALUES(?,?,?,?)", (token, data.role, data.student_id if data.role == "student" else None, now()))
        response.set_cookie("ieum_session", token, httponly=True, samesite="lax", max_age=86400, secure=os.getenv("IEUM_SECURE_COOKIES", "false").lower() == "true")
        return {"role": data.role}

    @app.delete("/api/session")
    def logout(request: Request, response: Response):
        with connect(path) as db:
            db.execute("DELETE FROM sessions WHERE token=?", (request.cookies.get("ieum_session", ""),))
        response.delete_cookie("ieum_session")
        return {"ok": True}

    @app.get("/api/session")
    def current(auth=Depends(session)):
        with connect(path) as db:
            student = find_student(db, auth["student_id"]) if auth["role"] == "student" else None
        return {"role": auth["role"], "name": student["name"] if student else "김하늘", "student": student, "class_name": "1학년 3반", "demo": True}

    @app.get("/api/students")
    def students(_=Depends(teacher)):
        with connect(path) as db:
            return [student_dict(row) for row in db.execute("SELECT * FROM students ORDER BY id")]

    @app.post("/api/diagnostic")
    def diagnostic(data: Diagnostic, auth=Depends(learner)):
        values = data.model_dump()
        everyday = values.pop("everyday")
        with connect(path) as db:
            db.execute("UPDATE students SET levels=?,everyday=?,diagnostic_source='self' WHERE id=?", (dumps(values), everyday, auth["student_id"]))
            return find_student(db, auth["student_id"])

    @app.get("/api/materials")
    def materials(auth=Depends(session)):
        with connect(path) as db:
            rows = db.execute("SELECT * FROM materials ORDER BY created_at DESC").fetchall()
        return [material_dict(row, auth["student_id"] if auth["role"] == "student" else None) for row in rows if auth["role"] == "teacher" or (row["status"] == "published" and auth["student_id"] in json.loads(row["targets"]))]

    @app.get("/api/materials/{mid}")
    def material(mid: str, auth=Depends(session)):
        with connect(path) as db:
            return find_material(db, mid, auth)

    @app.post("/api/extract")
    async def extract(file: UploadFile = File(...), _=Depends(teacher)):
        raw = await file.read(MAX_UPLOAD + 1)
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "10MB 이하의 PDF를 올려 주세요.")
        if not raw.startswith(b"%PDF-"):
            raise HTTPException(415, "PDF 파일만 지원합니다.")
        try:
            pdf = PdfReader(io.BytesIO(raw))
            if pdf.is_encrypted or len(pdf.pages) > 50:
                raise HTTPException(422, "암호가 없고 50쪽 이하인 PDF를 사용해 주세요.")
            text = "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, "PDF를 읽지 못했습니다. 텍스트를 직접 붙여 넣어 주세요.")
        if len(text) < 20:
            raise HTTPException(422, "추출할 텍스트가 없습니다. 스캔본 OCR은 아직 연결되지 않았습니다. 텍스트를 붙여 넣어 주세요.")
        if len(text) > 40000:
            raise HTTPException(422, "추출 텍스트가 너무 깁니다. 40,000자 이하로 나누어 올려 주세요.")
        return {"text": text, "pages": len(pdf.pages), "filename": file.filename}

    @app.post("/api/materials", status_code=201)
    def create_material(data: MaterialInput, auth=Depends(teacher)):
        mid = "lesson-" + secrets.token_hex(6)
        targets = list(dict.fromkeys(data.targets))
        with connect(path) as db:
            profiles = [find_student(db, sid) for sid in targets]
        # Network calls are made outside the DB transaction.
        try:
            variants = {
                s["id"]: agent.reconstruct(data.source_text, s["levels"]["reading"], s["language"], data.modes)
                for s in profiles
            }
        except SolarAgentError as exc:
            raise HTTPException(502, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        with connect(path) as db:
            db.execute("INSERT INTO materials VALUES(?,?,?,?,?,?,?,?,?,?,?)", (mid, data.title, data.subject, data.unit, data.source_text, dumps(data.modes), dumps(targets), dumps(variants), "[]", "draft", now()))
            return find_material(db, mid, auth)

    @app.patch("/api/materials/{mid}/review")
    def review(mid: str, data: ReviewInput, auth=Depends(teacher)):
        with connect(path) as db:
            item = find_material(db, mid, auth)
            if item["status"] == "published":
                raise HTTPException(409, "배포된 자료는 변경할 수 없습니다. 새 자료를 만들어 주세요.")
            if data.student_id not in item["targets"]:
                raise HTTPException(422, "자료의 대상 학생이 아닙니다.")
            item["variants"][data.student_id]["text"] = data.text
            terms = item["variants"][data.student_id]["terms"]
            if not set(data.translations) <= {t["term"] for t in terms} or any(not v.strip() or len(v) > 300 for v in data.translations.values()):
                raise HTTPException(422, "자료에 있는 교과어의 번역을 1~300자로 입력해 주세요.")
            for term in terms:
                if term["term"] in data.translations:
                    term["translation"] = data.translations[term["term"]].strip()
                term["verified"] = data.confirmed
            reviewed = set(item["reviewed"])
            if data.confirmed:
                reviewed.add(data.student_id)
            else:
                reviewed.discard(data.student_id)
            status = "reviewed" if reviewed == set(item["targets"]) else "draft"
            db.execute("UPDATE materials SET variants=?,reviewed=?,status=? WHERE id=?", (dumps(item["variants"]), dumps(sorted(reviewed)), status, mid))
            return find_material(db, mid, auth)

    @app.post("/api/materials/{mid}/publish")
    def publish(mid: str, auth=Depends(teacher)):
        with connect(path) as db:
            item = find_material(db, mid, auth)
            if item["status"] != "reviewed" or set(item["reviewed"]) != set(item["targets"]):
                raise HTTPException(409, "모든 대상 학생의 자료·번역을 검토한 뒤 배포해 주세요.")
            db.execute("UPDATE materials SET status='published' WHERE id=?", (mid,))
            return find_material(db, mid, auth)

    @app.get("/api/glossary")
    def glossary(_=Depends(session)):
        return {"terms": GLOSSARY, "languages": LANGUAGES, "notice": "예시 대역표이며 전문 검수된 번역 사전이 아닙니다. 저자원 언어를 포함한 모든 번역은 검토가 필요합니다."}

    @app.post("/api/glossary/check")
    def glossary_check(data: GlossaryInput, _=Depends(teacher)):
        results = []
        for entry in data.entries:
            term, candidate = entry.get("term", "").strip(), entry.get("candidate", "").strip()
            if not term or not candidate or len(candidate) > 300:
                raise HTTPException(422, "교과어와 번역 후보를 300자 이내로 입력해 주세요.")
            item = next((t for t in GLOSSARY if t["term"] == term), None)
            expected = item["translations"][data.language] if item else None
            match = expected is not None and candidate.casefold() == expected.casefold()
            results.append({"term": term, "candidate": candidate, "expected": expected, "status": "match" if match else "review" if expected else "unknown", "reason": "예시 대역과 일치합니다. 문맥 적합성은 별도 검토하세요." if match else "예시 대역과 다릅니다. 동의어·문맥을 확인하세요. 오역 확정은 아닙니다." if expected else "대역표에 없는 용어입니다. 전문가 검토가 필요합니다."})
        return results

    @app.post("/api/materials/{mid}/quiz", status_code=201)
    def create_quiz(mid: str, auth=Depends(teacher)):
        with connect(path) as db:
            item = find_material(db, mid, auth)
            if item["status"] != "published":
                raise HTTPException(409, "자료를 검토·배포한 뒤 문항을 만들어 주세요.")
            existing = db.execute("SELECT id FROM quizzes WHERE material_id=?", (mid,)).fetchone()
            if existing:
                return {"id": existing["id"]}
        # Do not hold a DB transaction open while requesting the LLM.
        try:
            questions = agent.questions(item["source_text"])
        except SolarAgentError as exc:
            raise HTTPException(502, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        qid = "quiz-" + secrets.token_hex(6)
        with connect(path) as db:
            db.execute("INSERT INTO quizzes VALUES(?,?,?,?)", (qid, mid, dumps(questions), now()))
            return {"id": qid}

    @app.get("/api/quizzes")
    def quizzes(auth=Depends(session)):
        with connect(path) as db:
            rows = db.execute("SELECT q.id,q.material_id,q.created_at,m.title,m.targets,m.status FROM quizzes q JOIN materials m ON m.id=q.material_id ORDER BY q.created_at DESC").fetchall()
            result = []
            for row in rows:
                if auth["role"] == "student" and (row["status"] != "published" or auth["student_id"] not in json.loads(row["targets"])):
                    continue
                attempt = db.execute("SELECT result,is_sample FROM attempts WHERE quiz_id=? AND student_id=? ORDER BY id DESC LIMIT 1", (row["id"], auth["student_id"])).fetchone() if auth["role"] == "student" else None
                result.append({"id": row["id"], "material_id": row["material_id"], "title": row["title"], "question_count": 4, "attempt": dict(json.loads(attempt["result"]), is_sample=bool(attempt["is_sample"])) if attempt else None})
            return result

    def find_quiz(db, qid, auth):
        quiz = db.execute("SELECT * FROM quizzes WHERE id=?", (qid,)).fetchone()
        if not quiz:
            raise HTTPException(404, "문항을 찾을 수 없습니다.")
        item = find_material(db, quiz["material_id"], auth)
        return quiz, item

    @app.get("/api/quizzes/{qid}")
    def quiz(qid: str, auth=Depends(session)):
        with connect(path) as db:
            row, item = find_quiz(db, qid, auth)
        return {"id": qid, "title": item["title"], "questions": public_questions(json.loads(row["questions"])), "fairness": "번역·교과어 풀이·정답 해설은 제출 전 제공하지 않습니다. 같은 개념을 일반 문장과 언어 부담을 낮춘 상황 문항으로 각각 확인합니다."}

    @app.post("/api/quizzes/{qid}/submit")
    def submit(qid: str, data: Answers, auth=Depends(learner)):
        with connect(path) as db:
            row, _item = find_quiz(db, qid, auth)
            questions = json.loads(row["questions"])
            if set(data.answers) != {q["id"] for q in questions} or any(type(a) is not int or a < 0 or a >= len(q["options"]) for q in questions for a in [data.answers.get(q["id"], -1)]):
                raise HTTPException(422, "모든 문항에 유효한 답을 선택해 주세요.")
            result = assess(questions, data.answers)
            db.execute("INSERT INTO attempts(quiz_id,student_id,result,created_at) VALUES(?,?,?,?)", (qid, auth["student_id"], dumps(result), now()))
        return result

    @app.get("/api/reports")
    def reports(_=Depends(teacher)):
        with connect(path) as db:
            result = []
            for row in db.execute("SELECT * FROM students ORDER BY id").fetchall():
                student = student_dict(row)
                attempt = db.execute("SELECT * FROM attempts WHERE student_id=? ORDER BY id DESC LIMIT 1", (student["id"],)).fetchone()
                result.append({"student": student, "attempt": dict(json.loads(attempt["result"]), is_sample=bool(attempt["is_sample"]), created_at=attempt["created_at"]) if attempt else None, "completed_steps": db.execute("SELECT count(*) FROM progress WHERE student_id=?", (student["id"],)).fetchone()[0], "saved_words": sum(len(json.loads(r[0])) for r in db.execute("SELECT unknown FROM learning WHERE student_id=?", (student["id"],)))})
            return result

    @app.get("/api/learning/{mid}")
    def learning(mid: str, auth=Depends(learner)):
        with connect(path) as db:
            find_material(db, mid, auth)
            row = db.execute("SELECT notes,known,unknown FROM learning WHERE student_id=? AND material_id=?", (auth["student_id"], mid)).fetchone()
        return {"notes": row["notes"], "known": json.loads(row["known"]), "unknown": json.loads(row["unknown"])} if row else {"notes": "", "known": [], "unknown": []}

    @app.put("/api/learning/{mid}")
    def save_learning(mid: str, data: LearningInput, auth=Depends(learner)):
        with connect(path) as db:
            item = find_material(db, mid, auth)
            valid = {t["term"] for t in item["variants"][auth["student_id"]]["terms"]}
            if set(data.known) & set(data.unknown) or not (set(data.known) | set(data.unknown)) <= valid:
                raise HTTPException(422, "자료에 있는 단어를 한 가지 상태로 저장해 주세요.")
            db.execute("INSERT INTO learning VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,material_id) DO UPDATE SET notes=excluded.notes,known=excluded.known,unknown=excluded.unknown,updated_at=excluded.updated_at", (auth["student_id"], mid, data.notes, dumps(data.known), dumps(data.unknown), now()))
        return {"ok": True}

    @app.get("/api/roadmap")
    def roadmap(auth=Depends(learner)):
        with connect(path) as db:
            student = find_student(db, auth["student_id"])
            completed = {r[0] for r in db.execute("SELECT step_id FROM progress WHERE student_id=?", (auth["student_id"],))}
        return {"reading_level": student["levels"]["reading"], "reason": "읽기 자가 점검이 1~2단계이면 교과어부터, 3~4단계이면 생활 속 적용부터 제안합니다. 데모 규칙이며 나머지 활동도 선택할 수 있어요.", "recommended": "words" if student["levels"]["reading"] <= 2 else "concepts", "steps": [dict({k: v for k, v in step.items() if k != "answer"}, completed=step["id"] in completed) for step in ROADMAP]}

    @app.post("/api/roadmap/{step_id}/complete")
    def complete(step_id: str, data: Exercise, auth=Depends(learner)):
        step = next((s for s in ROADMAP if s["id"] == step_id), None)
        if not step:
            raise HTTPException(404, "학습 활동을 찾을 수 없습니다.")
        correct = data.answer == step["answer"]
        if correct:
            with connect(path) as db:
                db.execute("INSERT OR IGNORE INTO progress VALUES(?,?,?)", (auth["student_id"], step_id, now()))
        return {"correct": correct, "message": "잘했어요! 학습 기록을 저장했어요." if correct else "다시 생각해 볼까요? 수업 자료에서 낱말의 뜻을 찾아보세요."}

    @app.get("/api/messages")
    def messages(student_id: str | None = None, auth=Depends(session)):
        sid = auth["student_id"] if auth["role"] == "student" else student_id
        with connect(path) as db:
            if not sid:
                return [dict(r) for r in db.execute("SELECT m.*,s.name FROM messages m JOIN students s ON m.student_id=s.id ORDER BY m.id")]
            find_student(db, sid)
            return [dict(r) for r in db.execute("SELECT * FROM messages WHERE student_id=? ORDER BY id", (sid,))]

    @app.post("/api/messages", status_code=201)
    def send_message(data: MessageInput, auth=Depends(session)):
        sid = auth["student_id"] if auth["role"] == "student" else data.student_id
        if not data.content.strip():
            raise HTTPException(422, "메시지를 입력해 주세요.")
        with connect(path) as db:
            find_student(db, sid)
            cursor = db.execute("INSERT INTO messages(student_id,sender,content,created_at) VALUES(?,?,?,?)", (sid, auth["role"], data.content.strip(), now()))
        return {"id": cursor.lastrowid}

    @app.post("/api/invitations", status_code=201)
    def invitation(_=Depends(teacher)):
        code = "IEUM-" + secrets.token_hex(3).upper()
        expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        with connect(path) as db:
            db.execute("INSERT INTO invitations VALUES(?,?,?)", (code, now(), expires))
        return {"code": code, "expires_at": expires, "notice": "학급 초대 코드 저장 데모입니다. 실제 가입·초대 발송은 인증 연동 후 제공됩니다."}

    # A built SPA can be served with this API, keeping production requests same-origin.
    @app.get("/{page:path}", include_in_schema=False)
    def spa(page: str):
        dist = ROOT / "dist"
        candidate = (dist / page).resolve()
        if not candidate.is_relative_to(dist.resolve()) or page.startswith("api/"):
            raise HTTPException(404, "페이지를 찾을 수 없습니다.")
        if candidate.is_file():
            return FileResponse(candidate)
        if (dist / "index.html").is_file():
            return FileResponse(dist / "index.html")
        raise HTTPException(404, "개발 화면은 Vite 서버에서 열어 주세요.")

    return app

app = create_app()
