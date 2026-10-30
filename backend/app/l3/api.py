import json
import secrets
from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..database import connect, dumps, now
from ..solar_agent import SolarAgentError
from .workflow import request_for, fingerprint, rule_plan, normalize


class Completion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reflection: str = Field(min_length=1, max_length=2000)


def register(app, path, learner, teacher, find_student, agent):
    def snapshot(db, sid):
        student = find_student(db, sid)
        return student.get("diagnostic_summary")

    def present(row):
        return {
            **json.loads(row["result"]),
            "id": row["id"],
            "progress": json.loads(row["progress"]),
            "created_at": row["created_at"],
        }

    def save(db, sid, result, fp):
        pid = "path-" + secrets.token_hex(8)
        db.execute(
            "INSERT INTO learning_paths(id,student_id,fingerprint,result,created_at) VALUES(?,?,?,?,?)",
            (pid, sid, fp, dumps(result), now()),
        )
        return present(
            db.execute("SELECT * FROM learning_paths WHERE id=?", (pid,)).fetchone()
        )

    def current(db, sid):
        result = snapshot(db, sid)
        if not result:
            return {
                "needs_diagnostic": True,
                "message": "6수준 진단으로 나의 출발점을 먼저 확인해요.",
            }
        fp = fingerprint(result)
        row = db.execute(
            "SELECT * FROM learning_paths WHERE student_id=? AND fingerprint=? ORDER BY created_at DESC LIMIT 1",
            (sid, fp),
        ).fetchone()
        if row:
            return present(row)
        request = request_for(result)
        return save(db, sid, normalize(rule_plan(result), request, "demo"), fp)

    @app.get("/api/roadmap")
    def roadmap(auth=Depends(learner)):
        with connect(path) as db:
            return current(db, auth["student_id"])

    @app.post("/api/roadmap/generate")
    def generate(auth=Depends(learner)):
        sid = auth["student_id"]
        with connect(path) as db:
            result = snapshot(db, sid)
        if not result:
            raise HTTPException(409, "6수준 진단을 먼저 진행해 주세요.")
        request = request_for(result)
        fp = fingerprint(result)
        try:
            plan = (
                agent.learning_path(request)
                if getattr(agent, "provider", "demo") == "solar"
                else rule_plan(result)
            )
            output = normalize(plan, request, agent.provider)
        except SolarAgentError as e:
            raise HTTPException(e.status_code, str(e)) from None
        except ValueError:
            raise HTTPException(
                422, "학습 경로의 형식과 진단 근거를 확인하지 못했습니다."
            ) from None
        with connect(path) as db:
            if fingerprint(snapshot(db, sid)) != fp:
                raise HTTPException(
                    409, "진단이 갱신됐습니다. 새 결과에서 다시 생성해 주세요."
                )
            return save(db, sid, output, fp)

    @app.post("/api/roadmap/{pid}/steps/{step_id}")
    def complete(pid: str, step_id: str, data: Completion, auth=Depends(learner)):
        if not data.reflection.strip():
            raise HTTPException(422, "해 본 활동이나 도움이 필요한 점을 적어 주세요.")
        with connect(path) as db:
            row = db.execute(
                "SELECT * FROM learning_paths WHERE id=? AND student_id=?",
                (pid, auth["student_id"]),
            ).fetchone()
            if not row:
                raise HTTPException(404, "자신의 학습 경로를 확인해 주세요.")
            if row["fingerprint"] != fingerprint(snapshot(db, auth["student_id"])):
                raise HTTPException(
                    409, "진단이 바뀌었습니다. 최신 경로를 확인해 주세요."
                )
            if step_id not in {s["id"] for s in json.loads(row["result"])["roadmap"]}:
                raise HTTPException(404, "학습 단계를 찾지 못했습니다.")
            progress = json.loads(row["progress"])
            progress[step_id] = {
                "reflection": data.reflection.strip(),
                "completed_at": now(),
            }
            db.execute(
                "UPDATE learning_paths SET progress=? WHERE id=?",
                (dumps(progress), pid),
            )
            return {"ok": True}

    @app.get("/api/students/{sid}/roadmap")
    def teacher_path(sid: str, auth=Depends(teacher)):
        with connect(path) as db:
            return current(db, sid)
