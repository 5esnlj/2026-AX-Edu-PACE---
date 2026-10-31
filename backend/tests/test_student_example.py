import json
import sys
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import create_app
from app.database import connect, initialize


class StudentExampleTests(unittest.TestCase):
    def test_pdf_import_persistence_provenance_and_new_diagnosis(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / "test.db")
            with TestClient(create_app(path)) as client:
                client.post("/api/demo/session", json={"role": "teacher"})
                students = client.get("/api/students").json()
                student = next(s for s in students if s["id"] == "std-example-a")
                self.assertEqual(student["diagnostic_source"], "imported_example")
                self.assertEqual(student["language"], "und")
                record = client.get("/api/students/std-example-a/diagnostic").json()[
                    "attempt"
                ]
                self.assertEqual(record["responses"], {})
                self.assertEqual(record["grades"], {})
                self.assertEqual(
                    record["source"]["reported_totals"], {"쓰-6": 5, "말-5": 7}
                )
                r = record["result"]
                self.assertEqual(
                    [
                        r["domains"][d]["display"]
                        for d in ["listening", "reading", "writing", "speaking"]
                    ],
                    ["5+", "5", "5", "4+"],
                )
                self.assertEqual(
                    (r["overall"], r["bottleneck"], r["gap"]), (5, "C", 0.46)
                )
                self.assertEqual(r["layers"]["C"]["score"], 6.5)
                self.assertEqual(r["subjects"]["사회"]["display"], "≤3")
                self.assertEqual(
                    r["subjects"]["사회"]["flags"], ["추측 의심", "교과 편차"]
                )
                profile = client.get(
                    "/api/students/std-example-a/reconstruction-profile"
                ).json()["profile"]
                self.assertIsNone(profile["native_language"])
                self.assertEqual(profile["overall_korean_level"], 5)
                client.post(
                    "/api/demo/session",
                    json={"role": "student", "student_id": "std-example-a"},
                )
                plan = client.get("/api/roadmap").json()
                self.assertFalse(plan["provisional"])
                self.assertIn("교과 개념", plan["roadmap"][0]["focus"])
                self.assertIn("말하기", plan["roadmap"][1]["focus"])
                self.assertIn("사회", plan["roadmap"][2]["focus"])
                client.post(
                    f"/api/roadmap/{plan['id']}/steps/step-1",
                    json={"reflection": "설명해 보았어요."},
                )
                initialize(path)
                self.assertIn("step-1", client.get("/api/roadmap").json()["progress"])
                attempt = client.post("/api/diagnostic/start").json()
                self.assertEqual(attempt["stage"], "listening")
                self.assertIsNone(attempt["source"])
                client.post(
                    f"/api/diagnostic/{attempt['id']}/submit",
                    json={
                        "stage": "listening",
                        "answers": {q["id"]: None for q in attempt["questions"]},
                    },
                )
                initialize(path)
                self.assertEqual(
                    client.get("/api/session").json()["student"]["diagnostic_source"],
                    "diagnostic_partial",
                )
                with connect(path) as db:
                    self.assertEqual(
                        db.execute(
                            "SELECT count(*) FROM students WHERE id='std-example-a'"
                        ).fetchone()[0],
                        1,
                    )
                    self.assertEqual(
                        db.execute(
                            "SELECT count(*) FROM diagnostic_attempts WHERE student_id='std-example-a'"
                        ).fetchone()[0],
                        2,
                    )
