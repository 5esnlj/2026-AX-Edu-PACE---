import copy
import json
import os
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import connect, dumps, initialize, now
from app.diagnosis.scoring import (
    BANK,
    DOMAINS,
    ITEMS,
    domain_level,
    evaluate,
    student_result,
    task_verdict,
)
from app.l3.workflow import normalize, request_for, rule_plan
from app.main import create_app
from app.solar_agent import SolarLearningAgent


def pdf_example():
    """The PDF's worked example, not a result assigned to any demo student."""
    wrong = {"듣-12", "읽-08", "읽-11", "읽-12"}
    responses = {
        q["id"]: ((q["answer"] + 1) % 4 if q["id"] in wrong else q["answer"])
        for q in BANK["items"]
        if "answer" in q
    }
    grades = {
        f"{p}-{n}": {"scores": [2, 2, 2, 2]} for p in ("쓰", "말") for n in range(1, 7)
    }
    grades["쓰-6"]["scores"] = [2, 1, 1, 1]
    grades["말-5"]["scores"] = [2, 2, 1, 2]
    grades["말-6"]["scores"] = [1, 1, 1, 1]
    return {
        "responses": responses,
        "grades": grades,
        "finished": DOMAINS[:],
        "stage": "complete",
    }


class DiagnosisScoringTests(unittest.TestCase):
    def test_pdf_blueprint_and_keys(self):
        self.assertEqual(len(ITEMS), 36)
        self.assertEqual(
            Counter(q["tier"] for q in BANK["items"]),
            {"B": 6, "T1": 6, "T2": 6, "T3": 6, "C": 12},
        )
        keys = {
            "listening": [1, 0, 0, 0, 0, 0, 2, 1, 0, 0, 1, 1],
            "reading": [1, 0, 1, 2, 0, 1, 2, 0, 1, 0, 2, 1],
        }
        for domain, answers in keys.items():
            qs = [q for q in BANK["items"] if q["domain"] == domain]
            self.assertEqual([q["answer"] for q in qs], answers)
            self.assertTrue(all(len(q["options"]) == 4 and q["stimulus"] for q in qs))
        self.assertIn("반대 의견", ITEMS["쓰-6"]["prompt"])
        self.assertIn("R1·R2", ITEMS["말-1"]["review_note"])
        self.assertEqual(
            BANK["levels"], ["시작", "초기", "발달", "확장", "연결", "도달"]
        )

    def test_task_thresholds_and_advanced_rubrics(self):
        for scores, level, expected in [
            ([2, 2, 2, 2], 1, "P"),
            ([1, 3, 3, 3], 6, "F"),
            ([2, 2, 1, 2], 4, "B"),
            ([3, 3, 1, 1], 4, "P"),
            ([3, 3, 1, 1], 5, "B"),
            ([2, 2, 2, 1], 6, "B"),
            ([2, 1, 1, 1], 2, "F"),
        ]:
            self.assertEqual(task_verdict(scores, level), expected)

    def test_contiguous_levels_one_correction_and_nonconsecutive_flag(self):
        result = domain_level(["P", "P", "B", "P", "P", "F"])
        self.assertEqual((result["level"], result["correction_level"]), (5, 3))
        result = domain_level(["P", "B", "P", "B", "P", "F"])
        self.assertEqual(
            (result["level"], result["display"], result["correction_level"]),
            (3, "3+", 2),
        )
        self.assertIn("비연속 통과", result["flags"])
        self.assertEqual(domain_level(["P", "F", "P", "P", "P", "P"])["level"], 1)
        self.assertEqual(domain_level(["F", "P", "P", "P", "P", "P"])["level"], 0)

    def test_pdf_worked_example_reproduces_all_profiles(self):
        result = evaluate(pdf_example())
        self.assertEqual(
            [result["domains"][d]["display"] for d in DOMAINS], ["5+", "5", "5", "4+"]
        )
        self.assertEqual(result["domains"]["reading"]["correction_level"], 4)
        self.assertEqual(result["overall"], 5)
        self.assertEqual(result["layers"]["C"]["score"], 6.5)
        self.assertAlmostEqual(result["layers"]["C"]["ratio"], 6.5 / 12, places=4)
        self.assertEqual(result["layers"]["T3"]["score"], 5)
        self.assertEqual(
            (result["bottleneck"], result["gap"], result["gap_label"]),
            ("C", 0.46, "중간 격차"),
        )
        self.assertEqual(
            [
                result["subjects"][s]["display"]
                for s in ["국어", "수학", "과학", "사회"]
            ],
            ["6", "5", "5", "≤3"],
        )
        self.assertEqual(result["subjects"]["국어"]["flags"], ["이해>표현"])
        self.assertEqual(result["subjects"]["수학"]["flags"], ["이해>표현"])
        self.assertEqual(
            result["subjects"]["사회"]["flags"], ["추측 의심", "교과 편차"]
        )
        self.assertEqual(result["subject_representative"], 5)
        student = student_result(result)
        self.assertNotIn("C", student["layers"])
        self.assertNotIn("raw", student["domains"]["reading"])
        self.assertTrue(student["subjects"]["사회"]["recheck"])

    def test_overall_cap_zero_and_unadministered_are_not_fake_levels(self):
        state = pdf_example()
        for q in BANK["items"]:
            if "answer" in q:
                state["responses"][q["id"]] = q["answer"]
        state["grades"] = {
            f"{p}-{n}": {"scores": [3, 3, 3, 3]}
            for p in ("쓰", "말")
            for n in range(1, 7)
        }
        for n in range(2, 7):
            state["grades"].pop(f"말-{n}")
        state["grades"]["말-2"] = {"scores": [0, 0, 0, 0]}
        state["grades"]["말-3"] = {"scores": [0, 0, 0, 0]}
        result = evaluate(state)
        self.assertEqual(result["overall"], 3)  # floor median=6, capped by 1+2
        self.assertEqual(result["layers"]["C"]["unadministered"], 2)
        state["grades"]["말-1"] = {"scores": [0, 0, 0, 0]}
        self.assertEqual(evaluate(state)["overall"], 0)
        self.assertEqual(
            student_result(evaluate(state))["overall_label"], "선생님과 다시 확인해요"
        )
        state["finished"].remove("speaking")
        self.assertIsNone(evaluate(state)["overall"])
        self.assertIsNone(evaluate(state)["layers"]["C"]["ratio"])

    def test_l3_varies_by_actual_profile_and_never_defaults_to_student_a(self):
        high = evaluate(pdf_example())
        high_plan = normalize(rule_plan(high), request_for(high), "demo")
        self.assertIn("교과 개념", high_plan["roadmap"][0]["focus"])
        self.assertIn("말하기", high_plan["roadmap"][1]["focus"])
        self.assertIn("사회", high_plan["roadmap"][2]["focus"])
        low = copy.deepcopy(high)
        low["domains"] = {
            d: dict(domain_level(["P", "F", "F", "미실시", "미실시", "미실시"]))
            for d in DOMAINS
        }
        low["bottleneck"] = "B"
        low["overall"] = 1
        low_plan = normalize(rule_plan(low), request_for(low), "demo")
        self.assertIn("생활", low_plan["roadmap"][0]["focus"])
        self.assertTrue(all(len(s["activities"]) == 1 for s in low_plan["roadmap"]))
        plan = rule_plan(high)
        plan.roadmap[0].evidence_ids = ["invented:ability"]
        with self.assertRaises(ValueError):
            normalize(plan, request_for(high), "demo")
        empty = evaluate({"responses": {}, "grades": {}, "finished": []})
        self.assertIn("함께 출발점", rule_plan(empty).roadmap[1].focus)


class DiagnosisApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "diagnosis.db")
        self.env = patch.dict(
            os.environ, {"IEUM_AGENT_PROVIDER": "demo", "IEUM_DEMO_ENABLED": "true"}
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = self.enterContext(TestClient(create_app(self.path)))
        self.login()

    def login(self, role="student", sid="std-1"):
        r = self.client.post(
            "/api/demo/session", json={"role": role, "student_id": sid}
        )
        self.assertEqual(r.status_code, 200, r.text)

    def start(self):
        r = self.client.post("/api/diagnostic/start")
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def submit_objective(self, attempt, answers=None):
        stage = attempt["stage"]
        values = answers or {
            q["id"]: ITEMS[q["id"]]["answer"] for q in attempt["questions"]
        }
        r = self.client.post(
            f"/api/diagnostic/{attempt['id']}/submit",
            json={"stage": stage, "answers": values},
        )
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def submit_task(self, attempt, scores=(2, 2, 2, 2)):
        qid = attempt["questions"][0]["id"]
        aid = attempt["id"]
        stage = attempt["stage"]
        r = self.client.post(
            f"/api/diagnostic/{aid}/submit",
            json={
                "stage": stage,
                "question_id": qid,
                "text": "테스트에서 제출한 과제 응답",
                "in_person": stage == "speaking",
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["pending"], qid)
        self.assertEqual(
            self.client.post(
                f"/api/diagnostic/{aid}/grade",
                json={"question_id": qid, "scores": list(scores)},
            ).status_code,
            403,
        )
        self.login("teacher")
        r = self.client.post(
            f"/api/diagnostic/{aid}/grade",
            json={
                "question_id": qid,
                "scores": list(scores),
                "observation_note": "대면으로 말한 내용을 직접 확인함",
                "language_note": "문장을 연결함",
                "concept_note": "언어 점수와 구분해서 관찰",
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.login()
        return self.client.get("/api/diagnostic").json()

    def test_unassessed_start_validation_drafts_and_role_isolation(self):
        student = self.client.get("/api/session").json()["student"]
        self.assertEqual(set(student["levels"].values()), {0})
        self.assertEqual(student["diagnostic_source"], "unassessed")
        self.assertTrue(self.client.get("/api/roadmap").json()["needs_diagnostic"])
        self.assertEqual(
            self.client.post("/api/diagnostic", json={"reading": 6}).status_code, 405
        )
        attempt = self.start()
        aid = attempt["id"]
        url = f"/api/diagnostic/{aid}"
        self.assertEqual(len(attempt["questions"]), 12)
        self.assertFalse(
            any("answer" in q or "rubric" in q for q in attempt["questions"])
        )
        self.assertEqual(self.start()["id"], aid)
        draft = {"stage": "listening", "answers": {"듣-01": 1, "듣-02": None}}
        self.assertEqual(self.client.put(url + "/draft", json=draft).status_code, 200)
        self.assertEqual(
            self.client.get("/api/diagnostic").json()["draft"]["answers"],
            draft["answers"],
        )
        self.assertEqual(self.client.post(url + "/submit", json=draft).status_code, 422)
        self.assertEqual(
            self.client.post(
                url + "/submit", json={**draft, "answers": {"듣-01": True}}
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(url + "/submit", json={**draft, "level": 6}).status_code,
            422,
        )
        self.login("student", "std-2")
        self.assertEqual(self.client.put(url + "/draft", json=draft).status_code, 403)
        self.assertEqual(
            self.client.get("/api/students/std-1/diagnostic").status_code, 403
        )
        self.assertEqual(self.client.get(url + "/audio/말-1").status_code, 403)
        self.login("teacher")
        self.assertEqual(self.client.post("/api/diagnostic/start").status_code, 403)

    def test_complete_pdf_example_teacher_profiles_and_persistent_learning_path(self):
        example = pdf_example()
        attempt = self.start()
        aid = attempt["id"]
        for domain in ("listening", "reading"):
            attempt = self.submit_objective(
                attempt,
                {
                    qid: answer
                    for qid, answer in example["responses"].items()
                    if ITEMS[qid]["domain"] == domain
                },
            )
        intermediate = self.client.get("/api/roadmap").json()
        self.assertTrue(intermediate["provisional"])
        for _ in range(12):
            qid = attempt["questions"][0]["id"]
            attempt = self.submit_task(attempt, example["grades"][qid]["scores"])
        self.assertEqual(attempt["stage"], "complete")
        self.assertEqual(attempt["result"]["overall"], 5)
        self.assertNotIn("C", attempt["result"]["layers"])
        plan = self.client.get("/api/roadmap").json()
        self.assertFalse(plan["provisional"])
        self.assertNotEqual(intermediate["id"], plan["id"])
        stale = self.client.post(
            f"/api/roadmap/{intermediate['id']}/steps/step-1",
            json={"reflection": "이전 결과"},
        )
        self.assertEqual(stale.status_code, 409)
        endpoint = f"/api/roadmap/{plan['id']}/steps/step-1"
        self.assertEqual(
            self.client.post(endpoint, json={"reflection": "  "}).status_code, 422
        )
        self.assertEqual(
            self.client.post(
                endpoint, json={"reflection": "원인과 결과로 설명했어요."}
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/roadmap").json()["progress"]["step-1"]["reflection"],
            "원인과 결과로 설명했어요.",
        )
        self.login("student", "std-2")
        self.assertEqual(
            self.client.post(endpoint, json={"reflection": "다른 학생"}).status_code,
            404,
        )
        self.login("teacher")
        teacher = self.client.get("/api/students/std-1/diagnostic").json()
        self.assertEqual(teacher["attempt"]["result"]["bottleneck"], "C")
        profile = self.client.get("/api/students/std-1/reconstruction-profile").json()
        self.assertEqual(profile["source"], "diagnostic")
        self.assertEqual(profile["profile"]["overall_korean_level"], 5)
        self.assertEqual(
            profile["profile"]["subject_profiles"]["사회"]["representative_level"], "≤3"
        )
        report = self.client.get("/api/reports").json()[0]
        self.assertEqual((report["completed_steps"], report["total_steps"]), (1, 3))
        self.assertEqual(report["student"]["levels"]["speaking"], 4)
        initialize(self.path)
        second = self.enterContext(TestClient(create_app(self.path)))
        second.post(
            "/api/demo/session", json={"role": "student", "student_id": "std-1"}
        )
        self.assertEqual(second.get("/api/diagnostic").json()["id"], aid)
        self.assertEqual(second.get("/api/roadmap").json()["id"], plan["id"])
        self.assertIn("step-1", second.get("/api/roadmap").json()["progress"])

    def test_stop_after_two_non_passes_audio_validation_and_missing_observation(self):
        attempt = self.submit_objective(self.submit_objective(self.start()))
        aid = attempt["id"]
        attempt = self.submit_task(attempt, [2, 2, 1, 2])  # B
        attempt = self.submit_task(attempt, [0, 0, 0, 0])  # F => stop writing
        self.assertEqual(attempt["stage"], "speaking")
        self.assertEqual(attempt["questions"][0]["id"], "말-1")
        self.assertEqual(attempt["result"]["domains"]["writing"]["level"], 0)
        audio = f"/api/diagnostic/{aid}/audio/말-1"
        self.assertEqual(
            self.client.post(
                audio, files={"file": ("x.wav", b"not audio", "audio/wav")}
            ).status_code,
            415,
        )
        data = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 32
        self.assertEqual(
            self.client.post(
                audio, files={"file": ("x.wav", data, "audio/wav")}
            ).status_code,
            200,
        )
        self.assertEqual(self.client.get(audio).content, data)
        attempt = self.submit_task(attempt, [0, 0, 0, 0])
        qid = attempt["questions"][0]["id"]
        r = self.client.post(
            f"/api/diagnostic/{aid}/submit",
            json={"stage": "speaking", "question_id": qid},
        )
        self.assertEqual(r.status_code, 422)
        self.client.post(
            f"/api/diagnostic/{aid}/submit",
            json={"stage": "speaking", "question_id": qid, "in_person": True},
        )
        self.login("teacher")
        payload = {"question_id": qid, "scores": [2, 2, 1, 2]}
        self.assertEqual(
            self.client.post(f"/api/diagnostic/{aid}/grade", json=payload).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(
                f"/api/diagnostic/{aid}/grade",
                json={**payload, "scores": [True, 2, 2, 2], "observation_note": "관찰"},
            ).status_code,
            422,
        )
        r = self.client.post(
            f"/api/diagnostic/{aid}/grade",
            json={**payload, "observation_note": "수업에서 직접 관찰"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["stage"], "complete")
        self.assertEqual(r.json()["result"]["overall"], 0)
        self.assertEqual(r.json()["result"]["layers"]["C"]["unadministered"], 4)
        self.assertEqual(
            self.client.post(
                f"/api/diagnostic/{aid}/grade",
                json={**payload, "observation_note": "중복"},
            ).status_code,
            409,
        )

    def test_old_four_level_data_is_discarded_once_without_backup_or_rescaling(self):
        with connect(self.path) as db:
            db.execute(
                "UPDATE students SET levels=?,everyday=4,diagnostic_source='self',level_scale='legacy_1_4'",
                (dumps(dict.fromkeys(DOMAINS, 4)),),
            )
            variant = {
                "text": "배포된 수업 본문은 유지합니다.",
                "level": 4,
                "reconstruction": {
                    "profile_context": {"level_scale": "app_1_4"},
                    "learner_decision": {"skill_profile": dict.fromkeys(DOMAINS, 4)},
                    "vocabulary": [{"learner_level": 4}],
                },
            }
            db.execute(
                "UPDATE materials SET variants=? WHERE id='lesson-demo'",
                (dumps({"std-1": variant}),),
            )
            db.execute(
                "INSERT INTO l1_profiles VALUES(?,?,?)",
                (
                    "std-1",
                    dumps({"level_scale": "app_1_4", "skills": {"reading": 4}}),
                    now(),
                ),
            )
        initialize(self.path)
        with connect(self.path) as db:
            row = db.execute("SELECT * FROM students WHERE id='std-1'").fetchone()
            self.assertEqual(set(json.loads(row["levels"]).values()), {0})
            self.assertEqual(
                (row["everyday"], row["diagnostic_source"], row["diagnostic_summary"]),
                (0, "unassessed", None),
            )
            self.assertEqual(
                db.execute("SELECT count(*) FROM l1_profiles").fetchone()[0], 0
            )
            self.assertEqual(
                db.execute("SELECT count(*) FROM materials").fetchone()[0], 1
            )
            variant = json.loads(
                db.execute(
                    "SELECT variants FROM materials WHERE id='lesson-demo'"
                ).fetchone()[0]
            )["std-1"]
            self.assertEqual(variant["level"], 0)
            self.assertEqual(variant["text"], "배포된 수업 본문은 유지합니다.")
            self.assertEqual(
                set(
                    variant["reconstruction"]["learner_decision"][
                        "skill_profile"
                    ].values()
                ),
                {None},
            )
            self.assertIsNone(
                variant["reconstruction"]["vocabulary"][0]["learner_level"]
            )
            self.assertFalse(
                any(
                    "backup" in r[0] or "legacy" in r[0]
                    for r in db.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    )
                )
            )
        attempt = self.submit_objective(self.start())
        initialize(self.path)
        self.assertEqual(
            self.client.get("/api/session").json()["student"]["levels"]["listening"], 6
        )
        self.assertEqual(self.client.get("/api/diagnostic").json()["id"], attempt["id"])
        self.login("teacher")
        self.assertEqual(
            self.client.put(
                "/api/students/std-1/reconstruction-profile",
                json={"level_scale": "app_1_4"},
            ).status_code,
            422,
        )

    def test_solar_uses_only_current_facts_and_rejects_invented_evidence(self):
        self.submit_objective(self.start())
        captures = []
        result = self.client.get("/api/session").json()["student"]["diagnostic_summary"]
        output = rule_plan(result).model_dump()

        def handler(request):
            captures.append(json.loads(request.content))
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": json.dumps(output, ensure_ascii=False)
                            },
                        }
                    ]
                },
            )

        with patch.dict(os.environ, {"UPSTAGE_API_KEY": "test-key-not-real"}):
            agent = SolarLearningAgent(transport=httpx.MockTransport(handler))
        other = self.enterContext(
            TestClient(create_app(self.path, learning_agent=agent))
        )
        other.post("/api/demo/session", json={"role": "student", "student_id": "std-1"})
        # Reading the page must not incur a paid model call.
        self.assertEqual(other.get("/api/roadmap").status_code, 200)
        self.assertEqual(captures, [])
        r = other.post("/api/roadmap/generate")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["provider"], "solar")
        raw = json.dumps(captures[0], ensure_ascii=False)
        self.assertNotIn("누리", raw)
        self.assertNotIn("std-1", raw)
        self.assertIn("diagnosis", raw)
        output["roadmap"][0]["evidence_ids"] = ["invented:level"]
        before = other.get("/api/roadmap").json()["id"]
        self.assertEqual(other.post("/api/roadmap/generate").status_code, 422)
        self.assertEqual(other.get("/api/roadmap").json()["id"], before)
        other.post("/api/demo/session", json={"role": "teacher"})
        self.assertEqual(other.post("/api/roadmap/generate").status_code, 403)
