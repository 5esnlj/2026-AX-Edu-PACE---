import io
import json
import secrets

from fastapi import Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from pypdf import PdfReader

from ..database import connect, dumps, now
from ..solar_agent import SolarAgentError
from ..l3.workflow import fingerprint
from ..l1.models import Academic, Skills, SubjectProfile
from .models import MaterialInput, OptIn, Answers
from .workflow import (request_for, demo_material, normalize_material, demo_assessment,
                       normalize_assessment, public_quiz, score, FAIRNESS)


def register(app, path, learner, find_student, l1_profile, agent):
    def profile_for(db, sid):
        student = find_student(db, sid)
        profile, _ = l1_profile(db, student)
        summary = student.get("diagnostic_summary") or {}
        # The current persisted diagnosis is authoritative, not an uploaded persona.
        profile.overall_korean_level = summary.get("overall") or None
        profile.skills = Skills(**{k: v or None for k, v in student["levels"].items()})
        # Layer ratios in the new diagnosis are not interchangeable with six
        # numeric proficiency levels; do not retain older manual layer guesses.
        profile.academic_korean = Academic()
        profile.daily_korean_support = None
        profile.diagnostic_notes = []
        profile.bottlenecks = [summary["bottleneck"]] if summary.get("bottleneck") else []
        profile.subject_profiles = {
            name: SubjectProfile(representative_level=("≤3" if value["level"] == 3 else value["level"]),
                                 recheck_required=value["recheck"], uncertainty_flags=value["flags"])
            for name, value in summary.get("subjects", {}).items() if value["level"]
        }
        data = profile.model_dump(exclude={"learner_id", "display_name"})
        # Keep provisional subject results, layer scores and uncertainty intact.
        data["diagnostic_evidence"] = summary
        return data, fingerprint(data)

    def find(db, mid, sid):
        row = db.execute("SELECT * FROM student_materials WHERE id=? AND student_id=?", (mid, sid)).fetchone()
        if not row:
            raise HTTPException(404, "나의 학습 자료를 찾지 못했습니다.")
        return row

    def present(row):
        profile = json.loads(row["profile"])
        return {"id": row["id"], "title": row["title"], "subject": row["subject"],
                "source_text": row["source_text"], "result": json.loads(row["result"]),
                "profile": {"level": profile.get("overall_korean_level"), "native_language": profile.get("native_language")},
                "completed_at": row["completed_at"], "created_at": row["created_at"],
                "quiz": public_quiz(json.loads(row["quiz"]) if row["quiz"] else None),
                "attempt": json.loads(row["attempt"]) if row["attempt"] else None}

    @app.get("/api/student-materials")
    def materials(auth=Depends(learner)):
        with connect(path) as db:
            rows = db.execute("SELECT * FROM student_materials WHERE student_id=? ORDER BY created_at DESC LIMIT 100", (auth["student_id"],)).fetchall()
            return [present(row) for row in rows]

    @app.post("/api/student-materials/extract")
    async def extract(file: UploadFile = File(...), _=Depends(learner)):
        raw = await file.read(10 * 1024 * 1024 + 1)
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(413, "10MB 이하의 PDF를 올려 주세요.")
        if not raw.startswith(b"%PDF-"):
            raise HTTPException(415, "PDF 파일만 지원합니다.")
        try:
            pdf = PdfReader(io.BytesIO(raw))
            if pdf.is_encrypted or len(pdf.pages) > 50:
                raise HTTPException(422, "암호가 없고 50쪽 이하인 PDF를 사용해 주세요.")
            text = "\n\n".join(page.extract_text() or "" for page in pdf.pages).strip()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, "PDF를 읽지 못했습니다. 텍스트를 직접 붙여 넣어 주세요.") from None
        if len(text) < 20:
            raise HTTPException(422, "추출할 글자가 없습니다. 스캔 PDF의 OCR은 지원하지 않으므로 텍스트를 직접 넣어 주세요.")
        if len(text) > 40000:
            raise HTTPException(422, "40,000자 이하로 나누어 올려 주세요.")
        return {"text": text, "filename": file.filename, "pages": len(pdf.pages)}

    @app.post("/api/student-materials", status_code=201)
    def create(data: MaterialInput, auth=Depends(learner)):
        sid = auth["student_id"]
        with connect(path) as db:
            profile, fp = profile_for(db, sid)
        request = request_for(profile, data.source_text, data.subject, data.title)
        if len(request["source_sentences"]) > 100 or any(len(s["source"]) > 4000 for s in request["source_sentences"]):
            raise HTTPException(422, "문장 사이에 줄바꿈을 넣고 100문장 이하로 나누어 주세요.")
        provider = getattr(agent, "provider", "demo") if profile["overall_korean_level"] else "original"
        try:
            # No diagnosis: do not spend tokens guessing a level or call it adapted.
            output = agent.student_reconstruct(request) if provider == "solar" and profile["overall_korean_level"] else demo_material(request)
            result = normalize_material(output, request, provider)
        except SolarAgentError as e:
            raise HTTPException(e.status_code, str(e)) from None
        except (ValueError, ValidationError):
            raise HTTPException(422, "재구성 자료의 형식이나 원문 근거를 확인하지 못했습니다. 자료를 나누어 다시 시도해 주세요.") from None
        mid = "student-material-" + secrets.token_hex(8)
        with connect(path) as db:
            if profile_for(db, sid)[1] != fp:
                raise HTTPException(409, "진단 정보가 바뀌었습니다. 최신 결과로 다시 만들어 주세요.")
            db.execute("INSERT INTO student_materials(id,student_id,title,subject,source_text,profile,fingerprint,result,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                       (mid, sid, data.title, data.subject, data.source_text, dumps(profile), fp, dumps(result), now()))
            return present(find(db, mid, sid))

    @app.get("/api/student-materials/{mid}")
    def detail(mid: str, auth=Depends(learner)):
        with connect(path) as db:
            return present(find(db, mid, auth["student_id"]))

    @app.post("/api/student-materials/{mid}/complete")
    def complete(mid: str, auth=Depends(learner)):
        with connect(path) as db:
            find(db, mid, auth["student_id"])
            db.execute("UPDATE student_materials SET completed_at=COALESCE(completed_at,?) WHERE id=?", (now(), mid))
            return present(find(db, mid, auth["student_id"]))

    @app.post("/api/student-materials/{mid}/quiz", status_code=201)
    def generate_quiz(mid: str, data: OptIn, auth=Depends(learner)):
        sid = auth["student_id"]
        with connect(path) as db:
            row = find(db, mid, sid)
            if not row["completed_at"] or not data.opt_in:
                raise HTTPException(409, "자료를 다 읽은 뒤, 이해 확인 문항 풀기를 선택해 주세요.")
            profile = json.loads(row["profile"])
            if not profile.get("overall_korean_level"):
                raise HTTPException(409, "한국어 자가 점검으로 6수준 진단을 완료하고 맞춤 자료를 새로 만들어 주세요.")
            if profile_for(db, sid)[1] != row["fingerprint"]:
                raise HTTPException(409, "진단 정보가 바뀌었습니다. 최신 결과로 맞춤 자료를 새로 만들어 주세요.")
            if row["quiz"]:
                return present(row)  # Reopening never makes another paid request.
            material = json.loads(row["result"])
        request = {"learner_profile": profile, "lesson_material": material, "fairness_rules": FAIRNESS,
                   "learning_completed": True, "learner_opted_in": True}
        try:
            output = agent.student_assessment(request) if getattr(agent, "provider", "demo") == "solar" else demo_assessment(material)
            quiz = normalize_assessment(output, material)
        except SolarAgentError as e:
            raise HTTPException(e.status_code, str(e)) from None
        except (ValueError, ValidationError):
            raise HTTPException(422, "문항의 형식·공정성 검토·학습 자료 근거를 확인하지 못했습니다. 다시 시도해 주세요.") from None
        with connect(path) as db:
            if profile_for(db, sid)[1] != row["fingerprint"]:
                raise HTTPException(409, "진단 정보가 바뀌었습니다. 최신 결과로 맞춤 자료를 새로 만들어 주세요.")
            db.execute("UPDATE student_materials SET quiz=? WHERE id=? AND quiz IS NULL", (dumps(quiz), mid))
            return present(find(db, mid, sid))

    @app.post("/api/student-materials/{mid}/quiz/submit")
    def submit(mid: str, data: Answers, auth=Depends(learner)):
        with connect(path) as db:
            row = find(db, mid, auth["student_id"])
            if not row["quiz"]:
                raise HTTPException(409, "이해 확인 문항을 먼저 만들어 주세요.")
            if row["attempt"]:
                return json.loads(row["attempt"])  # Keep the first completed response.
            try:
                result = dict(score(json.loads(row["quiz"]), data.answers), created_at=now())
            except ValueError as e:
                raise HTTPException(422, str(e)) from None
            db.execute("UPDATE student_materials SET attempt=? WHERE id=? AND attempt IS NULL", (dumps(result), mid))
            return json.loads(find(db, mid, auth["student_id"])["attempt"])
