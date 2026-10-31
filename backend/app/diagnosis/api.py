import json
import secrets
from fastapi import Depends, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictBool
from ..database import connect, dumps, now
from .scoring import (
    BANK,
    ITEMS,
    DOMAINS,
    RUBRIC,
    evaluate,
    student_result,
    task_verdict,
)


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage: str = Field(max_length=20)
    question_id: str | None = Field(default=None, max_length=20)
    answers: dict[str, StrictInt | None] = Field(default_factory=dict, max_length=12)
    text: str = Field(default="", max_length=8000)
    in_person: StrictBool = False


class Grade(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str = Field(max_length=20)
    scores: list[StrictInt] = Field(min_length=4, max_length=4)
    language_note: str = Field(default="", max_length=2000)
    concept_note: str = Field(default="", max_length=2000)
    observation_note: str = Field(default="", max_length=2000)


def register(app, path, learner, teacher, session, find_student):
    def fetch(db, aid, auth):
        row = db.execute(
            "SELECT * FROM diagnostic_attempts WHERE id=?", (aid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "진단 기록을 찾지 못했습니다.")
        if auth["role"] != "teacher" and row["student_id"] != auth["student_id"]:
            raise HTTPException(403, "자신의 진단만 볼 수 있습니다.")
        return dict(row), json.loads(row["state"])

    def persist(db, row, state):
        result = evaluate(state)
        db.execute(
            "UPDATE diagnostic_attempts SET state=?,updated_at=? WHERE id=?",
            (dumps(state), now(), row["id"]),
        )
        db.execute(
            "UPDATE students SET levels=?,everyday=0,diagnostic_source=?,diagnostic_summary=? WHERE id=?",
            (
                dumps({d: result["domains"][d]["level"] or 0 for d in DOMAINS}),
                "diagnostic" if result["complete"] else "diagnostic_partial",
                dumps(result),
                row["student_id"],
            ),
        )
        # A new diagnostic supersedes the former manually imported support profile.
        db.execute("DELETE FROM l1_profiles WHERE student_id=?", (row["student_id"],))
        return result

    def present(db, row, state, teacher_view=False):
        result = evaluate(state)
        stage = state["stage"]
        pending = state.get("pending")
        qs = []
        if stage in ("listening", "reading"):
            qs = [q for q in BANK["items"] if q["domain"] == stage]
        elif stage in ("writing", "speaking"):
            qs = [ITEMS[state["current"]]]
        questions = [
            {k: v for k, v in q.items() if k not in ("answer", "rubric", "review_note")}
            for q in qs
        ]
        audio_ids = [
            r[0]
            for r in db.execute(
                "SELECT question_id FROM diagnostic_audio WHERE attempt_id=?",
                (row["id"],),
            )
        ]
        output = {
            "id": row["id"],
            "stage": stage,
            "pending": pending,
            "questions": questions,
            "finished": state["finished"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "result": result if teacher_view else student_result(result),
            "responses": state["responses"],
            "draft": state.get("draft", {}),
            "audio": {
                qid: f"/api/diagnostic/{row['id']}/audio/{qid}" for qid in audio_ids
            },
            "notice": BANK["notice"],
            "source": state.get("source"),
        }
        if teacher_view:
            output.update(
                grades=state["grades"],
                rubric=RUBRIC,
                pending_task=ITEMS.get(pending),
                student_id=row["student_id"],
            )
        return output

    @app.get("/api/diagnostic")
    def current(auth=Depends(learner)):
        with connect(path) as db:
            row = db.execute(
                "SELECT * FROM diagnostic_attempts WHERE student_id=? ORDER BY created_at DESC LIMIT 1",
                (auth["student_id"],),
            ).fetchone()
            return present(db, dict(row), json.loads(row["state"])) if row else None

    @app.post("/api/diagnostic/start", status_code=201)
    def start(auth=Depends(learner)):
        with connect(path) as db:
            prior = db.execute(
                "SELECT * FROM diagnostic_attempts WHERE student_id=? ORDER BY created_at DESC LIMIT 1",
                (auth["student_id"],),
            ).fetchone()
            if prior and json.loads(prior["state"])["stage"] != "complete":
                return present(db, dict(prior), json.loads(prior["state"]))
            state = {
                "stage": "listening",
                "current": None,
                "pending": None,
                "responses": {},
                "grades": {},
                "finished": [],
            }
            aid = "diag-" + secrets.token_hex(8)
            timestamp = now()
            row = {
                "id": aid,
                "student_id": auth["student_id"],
                "created_at": timestamp,
                "updated_at": timestamp,
            }
            db.execute(
                "INSERT INTO diagnostic_attempts VALUES(?,?,?,?,?)",
                (aid, auth["student_id"], dumps(state), timestamp, timestamp),
            )
            return present(db, row, state)

    @app.post("/api/diagnostic/{aid}/submit")
    def submit(aid: str, data: Submission, auth=Depends(learner)):
        with connect(path) as db:
            row, state = fetch(db, aid, auth)
            if state["pending"] or state["stage"] == "complete":
                raise HTTPException(409, "교사 채점 대기 중이거나 완료된 진단입니다.")
            stage = state["stage"]
            if (
                data.stage != stage
                or stage in ("writing", "speaking")
                and data.question_id != state["current"]
            ):
                raise HTTPException(409, "현재 과제가 변경됐습니다. 새로고침해 주세요.")
            state.pop("draft", None)
            if stage in ("listening", "reading"):
                ids = {q["id"] for q in BANK["items"] if q["domain"] == stage}
                if set(data.answers) != ids or any(
                    v is not None and v not in range(4) for v in data.answers.values()
                ):
                    raise HTTPException(
                        422, "12문항의 선택 또는 무응답을 모두 확인해 주세요."
                    )
                state["responses"].update(data.answers)
                state["finished"].append(stage)
                state["stage"] = "reading" if stage == "listening" else "writing"
                if state["stage"] == "writing":
                    state["current"] = "쓰-1"
            else:
                qid = state["current"]
                audio = db.execute(
                    "SELECT 1 FROM diagnostic_audio WHERE attempt_id=? AND question_id=?",
                    (aid, qid),
                ).fetchone()
                if stage == "speaking" and not audio and not data.in_person:
                    raise HTTPException(
                        422,
                        "말하기 녹음을 첨부하거나 선생님 앞에서 말하기를 선택해 주세요.",
                    )
                state["responses"][qid] = {
                    "text": data.text.strip(),
                    "in_person": data.in_person,
                }
                state["pending"] = qid
            persist(db, row, state)
            return present(db, row, state)

    @app.put("/api/diagnostic/{aid}/draft")
    def draft(aid: str, data: Submission, auth=Depends(learner)):
        with connect(path) as db:
            row, state = fetch(db, aid, auth)
            if (
                state["pending"]
                or state["stage"] == "complete"
                or data.stage != state["stage"]
                or data.question_id != state.get("current")
            ):
                raise HTTPException(409, "현재 작성 중인 과제를 확인해 주세요.")
            allowed = {q["id"] for q in BANK["items"] if q["domain"] == state["stage"]}
            if not set(data.answers) <= allowed or any(
                v is not None and v not in range(4) for v in data.answers.values()
            ):
                raise HTTPException(422, "선택지를 확인해 주세요.")
            state["draft"] = data.model_dump()
            db.execute(
                "UPDATE diagnostic_attempts SET state=?,updated_at=? WHERE id=?",
                (dumps(state), now(), aid),
            )
        return {"ok": True}

    @app.post("/api/diagnostic/{aid}/audio/{qid}")
    async def upload_audio(
        aid: str, qid: str, file: UploadFile = File(...), auth=Depends(learner)
    ):
        mime = (file.content_type or "").split(";")[0]
        if mime == "audio/x-m4a":
            mime = "audio/mp4"
        if mime not in (
            "audio/webm",
            "audio/ogg",
            "audio/mp4",
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
        ):
            raise HTTPException(
                415, "지원하는 음성 파일(webm, ogg, m4a, mp3, wav)을 선택해 주세요."
            )
        raw = await file.read(12 * 1024 * 1024 + 1)
        if not raw or len(raw) > 12 * 1024 * 1024:
            raise HTTPException(413, "12MB 이하의 음성 파일을 사용해 주세요.")
        valid = (
            mime in ("audio/webm",)
            and raw.startswith(b"\x1aE\xdf\xa3")
            or mime == "audio/ogg"
            and raw.startswith(b"OggS")
            or mime == "audio/mp4"
            and raw[4:8] == b"ftyp"
            or mime == "audio/mpeg"
            and (raw.startswith(b"ID3") or raw[0] == 255)
            or mime in ("audio/wav", "audio/x-wav")
            and raw.startswith(b"RIFF")
        )
        if not valid:
            raise HTTPException(415, "파일 내용이 선택한 음성 형식과 맞지 않습니다.")
        with connect(path) as db:
            _, state = fetch(db, aid, auth)
            if (
                state["stage"] != "speaking"
                or state["current"] != qid
                or state["pending"]
            ):
                raise HTTPException(
                    409, "현재 말하기 과제에만 녹음을 올릴 수 있습니다."
                )
            db.execute(
                "INSERT OR REPLACE INTO diagnostic_audio VALUES(?,?,?,?)",
                (aid, qid, mime, raw),
            )
        return {"ok": True}

    @app.get("/api/diagnostic/{aid}/audio/{qid}")
    def audio(aid: str, qid: str, auth=Depends(session)):
        with connect(path) as db:
            fetch(db, aid, auth)
            row = db.execute(
                "SELECT mime_type,content FROM diagnostic_audio WHERE attempt_id=? AND question_id=?",
                (aid, qid),
            ).fetchone()
            if not row:
                raise HTTPException(404, "녹음이 없습니다.")
        return Response(
            content=row["content"],
            media_type=row["mime_type"],
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/students/{sid}/diagnostic")
    def teacher_diagnostic(sid: str, auth=Depends(teacher)):
        with connect(path) as db:
            student = find_student(db, sid)
            rows = db.execute(
                "SELECT * FROM diagnostic_attempts WHERE student_id=? ORDER BY created_at DESC",
                (sid,),
            ).fetchall()
            return {
                "student": student,
                "attempt": (
                    present(db, dict(rows[0]), json.loads(rows[0]["state"]), True)
                    if rows
                    else None
                ),
                "history": [
                    {
                        "id": r["id"],
                        "created_at": r["created_at"],
                        "stage": json.loads(r["state"])["stage"],
                    }
                    for r in rows
                ],
            }

    @app.post("/api/diagnostic/{aid}/grade")
    def grade(aid: str, data: Grade, auth=Depends(teacher)):
        if any(v not in range(4) for v in data.scores):
            raise HTTPException(422, "R1~R4 점수는 각각 0~3이어야 합니다.")
        with connect(path) as db:
            row, state = fetch(db, aid, auth)
            qid = data.question_id
            if state["pending"] != qid:
                raise HTTPException(409, "현재 제출된 채점 대기 과제를 확인해 주세요.")
            if ITEMS[qid]["domain"] == "speaking":
                audio = db.execute(
                    "SELECT 1 FROM diagnostic_audio WHERE attempt_id=? AND question_id=?",
                    (aid, qid),
                ).fetchone()
                if not audio and not data.observation_note.strip():
                    raise HTTPException(
                        422, "녹음이 없으면 대면 말하기 관찰 내용을 기록해 주세요."
                    )
            state["grades"][qid] = data.model_dump()
            state["pending"] = None
            n = ITEMS[qid]["level"]
            prefix = qid.split("-")[0]
            failed = task_verdict(data.scores, n) != "P"
            prior = state["grades"].get(f"{prefix}-{n-1}")
            stop = (
                n == 6
                or failed
                and prior
                and task_verdict(prior["scores"], n - 1) != "P"
            )
            if stop:
                state["finished"].append(state["stage"])
                state["stage"] = (
                    "speaking" if state["stage"] == "writing" else "complete"
                )
                state["current"] = "말-1" if state["stage"] == "speaking" else None
            else:
                state["current"] = f"{prefix}-{n+1}"
            persist(db, row, state)
            return present(db, row, state, True)
