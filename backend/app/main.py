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

from .cause import classify_causes
from .agents import LANGUAGES, SUBJECTS, GLOSSARY, SAMPLE_TEXT, LearningAgent, DemoLearningAgent, assess, public_questions
from .database import connect, dumps, initialize, now
from .solar_agent import SolarAgentError, SolarLearningAgent
from .diagnosis.api import register as register_diagnostic
from .l3.api import register as register_learning_path
from .student_l1.api import register as register_student_l1
from .l3.workflow import fingerprint
from .l1.models import LearnerProfile, ReconstructionEdits
from .l1.civil_trial import example as civil_trial_example
from .l2.models import AnalyzeInput
from .l2.workflow import GLOSSARY as L2_GLOSSARY, LANGUAGES as L2_LANGUAGES, prepare_request as prepare_l2, demo_analysis, normalize_output as normalize_l2
from .l1.workflow import (
    ROOT as L1_ROOT, fallback_profile, prepare_request, normalize_output, render_variant,
    demo_output, apply_teacher_edits,
)

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
    workflow: Literal["standard", "teacher_l1"] = "standard"

    @field_validator("title", "source_text")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("내용을 입력해 주세요.")
        return value.strip()

class SelfMaterialInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subject: Literal["사회", "과학", "수학", "국어"]
    unit: str = Field(default="", max_length=100)
    source_text: str = Field(min_length=20, max_length=40000)

class ReviewInput(BaseModel):
    student_id: str
    text: str | None = Field(default=None, min_length=10, max_length=40000)
    confirmed: bool
    translations: dict[str, str] = Field(default_factory=dict, max_length=100)
    reconstruction_edits: ReconstructionEdits | None = None

class Answers(BaseModel):
    answers: dict[str, StrictInt]

class LearningInput(BaseModel):
    notes: str = Field(default="", max_length=10000)
    known: list[str] = Field(default_factory=list, max_length=100)
    unknown: list[str] = Field(default_factory=list, max_length=100)

class MessageInput(BaseModel):
    student_id: str
    content: str = Field(min_length=1, max_length=2000)

class GlossaryInput(BaseModel):
    language: Literal["vi", "en", "uz", "mn", "bn"]
    entries: list[dict[str, str]] = Field(min_length=1, max_length=30)

def student_dict(row):
    result = dict(row)
    result["levels"] = json.loads(result["levels"])
    result["diagnostic_summary"] = json.loads(result["diagnostic_summary"]) if result.get("diagnostic_summary") else None
    result["academic"] = (result["diagnostic_summary"] or {}).get("overall") or 0
    return result

def material_dict(row, student_id=None):
    result = dict(row)
    for key in ["modes", "targets", "variants", "reviewed"]:
        result[key] = json.loads(result[key])
    if student_id:
        result["variants"] = {student_id: result["variants"][student_id]}
        result["targets"] = [student_id]
        result["reviewed"] = [student_id] if student_id in result["reviewed"] else []
        # Teacher diagnosis, uncertainty and review rationale are not student-facing content.
        result["variants"][student_id].pop("reconstruction", None)
    return result

def create_app(db_path: str | None = None, learning_agent: LearningAgent | None = None):
    path = db_path or os.getenv("IEUM_DB_PATH", str(ROOT / ".data" / "ieum.db"))
    demo_enabled = os.getenv("IEUM_DEMO_ENABLED", "true").lower() == "true"

    @asynccontextmanager
    async def lifespan(_app):
        initialize(path)
        yield

    app = FastAPI(title="가나다계단 Learning API", version="0.1.0", lifespan=lifespan)
    if learning_agent is not None:
        agent = learning_agent
    elif os.getenv("IEUM_AGENT_PROVIDER", "demo").strip().lower() == "solar":
        agent = SolarLearningAgent()
    elif os.getenv("IEUM_AGENT_PROVIDER", "demo").strip().lower() == "demo":
        agent = DemoLearningAgent()
    else:
        raise ValueError("IEUM_AGENT_PROVIDER는 demo 또는 solar로 설정해 주세요.")

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
        return {"status": "ok", "provider": getattr(agent, "provider", "custom"), "configured": getattr(agent, "configured", True), "model": getattr(agent, "model", None), "demo_enabled": demo_enabled}

    @app.post("/api/agent/check")
    def check_agent(_=Depends(teacher)):
        if getattr(agent, "provider", "demo") != "solar":
            raise HTTPException(409, "현재 규칙 기반 데모 모드입니다. 프로젝트 .env에서 IEUM_AGENT_PROVIDER=solar로 설정하고 서버를 다시 실행해 주세요.")
        try:
            return {**agent.check_connection(), "checked_at": now()}
        except SolarAgentError as error:
            raise HTTPException(error.status_code, str(error)) from None

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

    def l1_profile(db, student):
        row = db.execute("SELECT profile FROM l1_profiles WHERE student_id=?", (student["id"],)).fetchone()
        if row:
            return LearnerProfile.model_validate_json(row["profile"]), "teacher"
        summary = student.get("diagnostic_summary")
        profile = fallback_profile(student)
        if summary:
            profile.overall_korean_level = summary.get("overall") or None
            profile.bottlenecks = [summary["bottleneck"]] if summary.get("bottleneck") else []
            profile.diagnostic_notes = ["첨부 6수준 진단 기준의 결과입니다. 미완료·재확인 표시를 함께 참고합니다."]
            from .l1.models import SubjectProfile
            profile.subject_profiles = {name: SubjectProfile(representative_level=("≤3" if v["level"]==3 else v["level"]), recheck_required=v["recheck"], uncertainty_flags=v["flags"]) for name,v in summary["subjects"].items() if v["level"]}
        return profile, "diagnostic" if summary else "app"

    @app.get("/api/students/{sid}/reconstruction-profile")
    def get_l1_profile(sid: str, _=Depends(teacher)):
        with connect(path) as db:
            profile, source = l1_profile(db, find_student(db, sid))
        return {"profile": profile.model_dump(), "source": source}

    @app.put("/api/students/{sid}/reconstruction-profile")
    def save_l1_profile(sid: str, profile: LearnerProfile, _=Depends(teacher)):
        with connect(path) as db:
            find_student(db, sid)
            db.execute("INSERT INTO l1_profiles VALUES(?,?,?) ON CONFLICT(student_id) DO UPDATE SET profile=excluded.profile,updated_at=excluded.updated_at",
                       (sid, profile.model_dump_json(), now()))
        return {"profile": profile.model_dump(), "source": "teacher"}

    @app.delete("/api/students/{sid}/reconstruction-profile")
    def remove_l1_profile(sid: str, _=Depends(teacher)):
        with connect(path) as db:
            find_student(db, sid)
            db.execute("DELETE FROM l1_profiles WHERE student_id=?", (sid,))
        return {"ok": True}

    @app.get("/api/l1/example-profile")
    def example_l1_profile(_=Depends(teacher)):
        return json.loads((L1_ROOT / "data/learners.example.json").read_text(encoding="utf-8"))

    @app.get("/api/l1/civil-trial-example")
    def get_civil_trial_example(_=Depends(teacher)):
        return civil_trial_example()

    register_diagnostic(app, path, learner, teacher, session, find_student)
    register_learning_path(app, path, learner, teacher, find_student, agent)
    register_student_l1(app, path, learner, find_student, l1_profile, agent)

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
    async def extract(file: UploadFile = File(...), include_page_markers: bool = False, _=Depends(session)):
        raw = await file.read(MAX_UPLOAD + 1)
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "10MB 이하의 PDF를 올려 주세요.")
        if not raw.startswith(b"%PDF-"):
            raise HTTPException(415, "PDF 파일만 지원합니다.")
        try:
            pdf = PdfReader(io.BytesIO(raw))
            if pdf.is_encrypted or len(pdf.pages) > 50:
                raise HTTPException(422, "암호가 없고 50쪽 이하인 PDF를 사용해 주세요.")
            page_texts = [page.extract_text() or "" for page in pdf.pages]
            text = "\n".join(f"[쪽 {i + 1}]\n{value}" if include_page_markers and value.strip() else value for i, value in enumerate(page_texts)).strip()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, "PDF를 읽지 못했습니다. 텍스트를 직접 붙여 넣어 주세요.")
        if sum(len(value.strip()) for value in page_texts) < 20:
            raise HTTPException(422, "추출할 텍스트가 없습니다. 스캔본 OCR은 아직 연결되지 않았습니다. 텍스트를 붙여 넣어 주세요.")
        if len(text) > 40000:
            raise HTTPException(422, "추출 텍스트가 너무 깁니다. 40,000자 이하로 나누어 올려 주세요.")
        return {"text": text, "pages": len(pdf.pages), "filename": file.filename}

    @app.get("/api/translation-review/glossary")
    def translation_glossary(_=Depends(teacher)):
        return {**L2_GLOSSARY, "analysis_languages": L2_LANGUAGES}

    @app.post("/api/translation-reviews", status_code=201)
    def analyze_translation(data: AnalyzeInput, auth=Depends(teacher)):
        if data.material_id:
            with connect(path) as db:
                find_material(db, data.material_id, auth)
        try:
            request = prepare_l2(data)
            if getattr(agent, "provider", "") == "demo":
                output = demo_analysis(data, request)
            elif callable(getattr(agent, "analyze_translation", None)):
                output = agent.analyze_translation(request)
            else:
                raise HTTPException(503, "현재 에이전트가 오역 탐지를 지원하지 않습니다.")
            result = normalize_l2(output, data, request, agent.provider)
        except SolarAgentError as exc:
            raise HTTPException(exc.status_code, str(exc)) from None
        except ValueError:
            raise HTTPException(422, "분석 입력과 결과 형식을 확인해 주세요. 본문은 40,000자·500문단 이하로 나누어 입력해 주세요.") from None
        rid, created = "review-" + secrets.token_hex(6), now()
        parameters = data.model_dump(exclude={"document_text", "title", "material_id"})
        with connect(path) as db:
            db.execute("INSERT INTO translation_reviews VALUES(?,?,?,?,?,?,?)", (rid, data.title, data.material_id, data.document_text, dumps(parameters), dumps(result), created))
        return {"id": rid, "title": data.title, "material_id": data.material_id, "document_text": data.document_text,
                "parameters": parameters, "result": result, "created_at": created}

    @app.get("/api/translation-reviews")
    def list_translation_reviews(_=Depends(teacher)):
        with connect(path) as db:
            rows = db.execute("SELECT id,title,material_id,result,created_at FROM translation_reviews ORDER BY created_at DESC LIMIT 100").fetchall()
        return [{"id": r["id"], "title": r["title"], "material_id": r["material_id"], "created_at": r["created_at"],
                 "counts": json.loads(r["result"])["counts"], "needs_selection": json.loads(r["result"])["needs_selection"]} for r in rows]

    @app.get("/api/translation-reviews/{rid}")
    def get_translation_review(rid: str, _=Depends(teacher)):
        with connect(path) as db:
            row = db.execute("SELECT * FROM translation_reviews WHERE id=?", (rid,)).fetchone()
        if not row:
            raise HTTPException(404, "오역 검토 기록을 찾을 수 없습니다.")
        return {**dict(row), "parameters": json.loads(row["parameters"]), "result": json.loads(row["result"])}

    def make_variants(data, targets):
        with connect(path) as db:
            profiles = [find_student(db, sid) for sid in targets]
            requests = {}
            if data.workflow == "teacher_l1":
                for student in profiles:
                    profile, profile_source = l1_profile(db, student)
                    vocabulary_state = {}
                    for row in db.execute("SELECT known,unknown FROM learning WHERE student_id=? ORDER BY updated_at", (student["id"],)):
                        for state in ("known", "unknown"):
                            vocabulary_state.update({term: state for term in json.loads(row[state]) if term in data.source_text})
                    requests[student["id"]] = prepare_request(profile, data.source_text, data.subject, data.title, profile_source, vocabulary_state)
        # Network calls are made outside the DB transaction.
        try:
            variants = {}
            for student in profiles:
                if data.workflow == "teacher_l1":
                    request = requests[student["id"]]
                    if getattr(agent, "provider", "") == "demo":
                        raw = demo_output(request)
                    elif callable(getattr(agent, "reconstruct_l1", None)):
                        raw = agent.reconstruct_l1(request)
                    else:
                        raise HTTPException(503, "현재 모델 어댑터가 교사용 L1 재구성을 지원하지 않습니다.")
                    output = normalize_output(raw, request)
                    variants[student["id"]] = render_variant(output, data.source_text, student, agent.provider)
                else:
                    variants[student["id"]] = agent.reconstruct(data.source_text, student["levels"]["reading"], student["language"], data.modes)
        except SolarAgentError as exc:
            raise HTTPException(exc.status_code, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        modes = sorted({m for v in variants.values() for m in v["reconstruction"]["learner_decision"]["methods_selected"]}) if data.workflow == "teacher_l1" else data.modes
        return variants, modes

    @app.post("/api/materials", status_code=201)
    def create_material(data: MaterialInput, auth=Depends(teacher)):
        mid = "lesson-" + secrets.token_hex(6)
        targets = list(dict.fromkeys(data.targets))
        variants, modes = make_variants(data, targets)
        with connect(path) as db:
            db.execute("INSERT INTO materials VALUES(?,?,?,?,?,?,?,?,?,?,?)", (mid, data.title, data.subject, data.unit, data.source_text, dumps(modes), dumps(targets), dumps(variants), "[]", "draft", now()))
            return find_material(db, mid, auth)

    @app.post("/api/my-materials", status_code=201)
    def create_self_material(data: SelfMaterialInput, auth=Depends(learner)):
        # 자기주도학습: 학생이 직접 넣은 자료를 본인 프로필로 바로 재구성해요. 교사 검토 없이 본인에게만 보여요.
        sid = auth["student_id"]
        full = MaterialInput(title=data.title, subject=data.subject, unit=data.unit, source_text=data.source_text, targets=[sid], modes=["easy", "bilingual", "visual"], workflow="teacher_l1")
        variants, modes = make_variants(full, [sid])
        mid = "self-" + secrets.token_hex(6)
        with connect(path) as db:
            db.execute("INSERT INTO materials VALUES(?,?,?,?,?,?,?,?,?,?,?)", (mid, full.title, full.subject, full.unit, full.source_text, dumps(modes), dumps([sid]), dumps(variants), dumps([sid]), "published", now()))
            return find_material(db, mid, auth)

    @app.patch("/api/materials/{mid}/review")
    def review(mid: str, data: ReviewInput, auth=Depends(teacher)):
        with connect(path) as db:
            item = find_material(db, mid, auth)
            if item["status"] == "published":
                raise HTTPException(409, "배포된 자료는 변경할 수 없습니다. 새 자료를 만들어 주세요.")
            if data.student_id not in item["targets"]:
                raise HTTPException(422, "자료의 대상 학생이 아닙니다.")
            variant = item["variants"][data.student_id]
            if "reconstruction" in variant:
                if data.reconstruction_edits is None or data.text is not None or data.translations:
                    raise HTTPException(422, "L1 자료는 문장·어휘·시각 자료 검토 항목으로 수정해 주세요.")
                try:
                    item["variants"][data.student_id] = apply_teacher_edits(variant, item["source_text"], data.reconstruction_edits, data.confirmed)
                except ValueError:
                    raise HTTPException(422, "L1 수정 내용을 확인해 주세요. 원문 연결과 핵심 개념어를 유지하고, 시각 자료의 제목·내용·설명을 입력해 주세요.") from None
            else:
                if data.text is None or data.reconstruction_edits is not None:
                    raise HTTPException(422, "자료의 글과 번역 수정 내용을 입력해 주세요.")
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
            raise HTTPException(exc.status_code, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        qid = "quiz-" + secrets.token_hex(6)
        with connect(path) as db:
            # Concurrent generation requests may finish after another request saved a quiz.
            db.execute("INSERT INTO quizzes VALUES(?,?,?,?) ON CONFLICT(material_id) DO NOTHING", (qid, mid, dumps(questions), now()))
            return {"id": db.execute("SELECT id FROM quizzes WHERE material_id=?", (mid,)).fetchone()["id"]}

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
                current_path = db.execute("SELECT progress,result FROM learning_paths WHERE student_id=? AND fingerprint=? ORDER BY created_at DESC LIMIT 1",
                                          (student["id"], fingerprint(student["diagnostic_summary"]))).fetchone()
                completed = len(json.loads(current_path["progress"])) if current_path else 0
                total = len(json.loads(current_path["result"])["roadmap"]) if current_path else 0
                attempt_data = None
                if attempt:
                    attempt_data = dict(json.loads(attempt["result"]), is_sample=bool(attempt["is_sample"]), created_at=attempt["created_at"])
                    subject = db.execute("SELECT m.subject FROM quizzes q JOIN materials m ON m.id=q.material_id WHERE q.id=?", (attempt["quiz_id"],)).fetchone()
                    cause = classify_causes(attempt_data["results"], subject[0] if subject else None, student["diagnostic_summary"])
                    # 원인 구분 기준(교과별 학습 한국어 수준)으로 지원 방향을 정해요.
                    attempt_data.update(cause=cause, kind=cause["kind"], label=cause["label"], recommendation=cause["action"])
                result.append({"student": student, "attempt": attempt_data, "completed_steps": completed, "total_steps": total, "saved_words": sum(len(json.loads(r[0])) for r in db.execute("SELECT unknown FROM learning WHERE student_id=?", (student["id"],)))})
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
