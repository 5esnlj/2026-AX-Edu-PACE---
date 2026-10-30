import copy
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.l1 import civil_trial
from app.l1.models import LearnerProfile, ReconstructionEdits
from app.l1.workflow import prepare_request, demo_output, normalize_output, apply_teacher_edits, render_variant
from app.main import create_app


def edits_for(output):
    return {"sentences": [{"id": s["id"], "rewritten": s["rewritten"], "explanation": s["explanation"]} for s in output["key_sentences"]],
            "vocabulary": [{k: v[k] for k in ("term", "tier", "action", "simple_meaning", "translation")} for v in output["vocabulary"]],
            "visual_aids": [{k: v[k] for k in ("title", "description", "items", "alt_text", "visible_by_default")} for v in output["visual_aids"]]}


def profile():
    return LearnerProfile.model_validate(next(p["profile"] for p in civil_trial.example()["profiles"] if p["profile"]["skills"]["reading"] == 2))


def request_for(learner=None):
    return prepare_request(learner or profile(), civil_trial.SOURCE, "사회", "민사 재판", "teacher")


class L1ExampleTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"IEUM_AGENT_PROVIDER": "demo", "IEUM_DEMO_ENABLED": "true"})
        env.start(); self.addCleanup(env.stop)

    def test_example_is_teacher_only_and_never_includes_seeded_mistranslations(self):
        with tempfile.TemporaryDirectory() as folder, TestClient(create_app(str(Path(folder) / "test.db"))) as client:
            self.assertEqual(client.get("/api/l1/civil-trial-example").status_code, 401)
            client.post("/api/demo/session", json={"role": "student"})
            self.assertEqual(client.get("/api/l1/civil-trial-example").status_code, 403)
            client.post("/api/demo/session", json={"role": "teacher"})
            data = client.get("/api/l1/civil-trial-example").json()
            self.assertEqual(data["source_text"], civil_trial.SOURCE)
            self.assertNotIn("seeded_gloss_errors", data)
            self.assertNotIn("原稿", str(data))
            self.assertEqual(data["source_pdf_url"], civil_trial.PDF_URL)
            self.assertEqual(len(data["profiles"]), 4)
            for sample in data["profiles"]:
                LearnerProfile.model_validate(sample["profile"])
            blocks = {b["id"]: b for b in data["blocks"]}
            self.assertEqual(blocks["q1"]["printed_page"], 210)
            self.assertEqual(blocks["law"]["page"], 2)
            self.assertIn("민사소송법 제87조", blocks["law"]["source"])
            self.assertTrue(blocks["q1b"]["source"].startswith("____"))
            self.assertLess(data["source_text"].index(blocks["q3"]["source"]), data["source_text"].index(blocks["goal"]["source"]))

    def test_demo_keeps_unknown_levels_and_shared_reference_precedence(self):
        request = request_for(LearnerProfile(native_language="몽골어", level_scale="diagnostic_1_6", skills={"reading": None}))
        output = normalize_output(demo_output(request), request)
        self.assertFalse(any(s["swaps"] for s in output["key_sentences"]))
        self.assertTrue(any(s["explanation"] for s in output["key_sentences"]))
        self.assertEqual(output["profile_context"]["level_scale"], "diagnostic_1_6")
        defendant = next(t for t in output["vocabulary"] if t["term"] == "피고")
        self.assertEqual(defendant["translation"], "хэрэгтэн")
        self.assertEqual(defendant["translation_status"], "review")
        self.assertIsNone(defendant["required_level"])
        variant = render_variant(output, civil_trial.SOURCE, {"levels": {"reading": 2}, "language": "mn"}, "demo")
        self.assertEqual(variant["text"], "\n".join(s["source"] for s in request["source_sentences"]))
        self.assertEqual(len(variant["reading_support"]), len(request["source_sentences"]))
        self.assertFalse(variant["visuals"][0]["visible_by_default"])

    def test_server_derives_phrase_changes_and_rejects_unsafe_anchors(self):
        request = request_for()
        raw = demo_output(request)
        output = normalize_output(raw, request)
        changed = next(s for s in output["key_sentences"] if s["swaps"])
        self.assertNotEqual(changed["rewritten"], changed["source"])
        self.assertNotIn("원문에 없는 추가 사실", changed["rewritten"])
        for swaps in ([{"original": "없는 표현", "replacement": "새 표현"}],
                      [{"original": changed["swaps"][0]["original"], "replacement": "너무 긴 표현" * 100}],
                      [changed["swaps"][0], changed["swaps"][0]]):
            with self.subTest(swaps=swaps):
                value = raw.model_dump()
                target = next(s for s in value["key_sentences"] if s["id"] == changed["id"])
                target["swaps"] = swaps
                with self.assertRaises(ValueError):
                    normalize_output(type(raw).model_validate(value), request)
        value = raw.model_dump()
        target = next(s for s in value["key_sentences"] if "원고" in s["source"])
        target["swaps"] = [{"original": "원고", "replacement": "사람"}]
        with self.assertRaises(ValueError):
            normalize_output(type(raw).model_validate(value), request)
        value = raw.model_dump()
        target = next(s for s in value["key_sentences"] if s["id"] == changed["id"])
        target["rewritten"] = "원문에 없는 추가 사실"
        result = normalize_output(type(raw).model_validate(value), request)
        self.assertEqual(next(s for s in result["key_sentences"] if s["id"] == changed["id"])["rewritten"], changed["rewritten"])

    def test_law_and_concepts_survive_teacher_edits_and_stale_swaps_are_cleared(self):
        request = request_for()
        output = normalize_output(demo_output(request), request)
        variant = render_variant(output, civil_trial.SOURCE, {"levels": {"reading": 2}, "language": "uz"}, "demo")
        edits = edits_for(output)
        law = next(s for s in output["key_sentences"] if s["fixed"])
        invalid = copy.deepcopy(edits)
        next(s for s in invalid["sentences"] if s["id"] == law["id"])["rewritten"] = "임의로 바꾼 법률 문장입니다."
        with self.assertRaises(ValueError):
            apply_teacher_edits(variant, civil_trial.SOURCE, ReconstructionEdits.model_validate(invalid), False)
        change = next(s for s in output["key_sentences"] if s["swaps"])
        next(s for s in edits["sentences"] if s["id"] == change["id"])["rewritten"] = change["source"]
        result = apply_teacher_edits(variant, civil_trial.SOURCE, ReconstructionEdits.model_validate(edits), False)
        self.assertFalse(next(s for s in result["reconstruction"]["key_sentences"] if s["id"] == change["id"])["swaps"])
        raw = demo_output(request)
        next(s for s in raw.key_sentences if s.id == law["id"]).rewritten = "법 조문을 임의로 바꾸었습니다."
        with self.assertRaises(ValueError):
            normalize_output(raw, request)

    def test_example_generation_review_publish_and_student_support_persist(self):
        with tempfile.TemporaryDirectory() as folder, TestClient(create_app(str(Path(folder) / "test.db"))) as client:
            client.post("/api/demo/session", json={"role": "teacher"})
            client.put("/api/students/std-1/reconstruction-profile", json=profile().model_dump())
            response = client.post("/api/materials", json={"title": "민사 재판", "subject": "사회", "source_text": civil_trial.SOURCE,
                "targets": ["std-1"], "workflow": "teacher_l1", "modes": ["easy", "bilingual", "visual"]})
            self.assertEqual(response.status_code, 201, response.text)
            item = response.json(); mid = item["id"]
            variant = item["variants"]["std-1"]
            self.assertTrue(any(s["swaps"] for s in variant["reading_support"]))
            self.assertEqual(client.post(f"/api/materials/{mid}/publish").status_code, 409)
            edits = edits_for(variant["reconstruction"])
            next(s for s in edits["sentences"] if s["explanation"])["explanation"] = "교사가 확인한 쉬운 설명입니다."
            response = client.patch(f"/api/materials/{mid}/review", json={"student_id": "std-1", "confirmed": True, "reconstruction_edits": edits})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(client.post(f"/api/materials/{mid}/publish").status_code, 200)
            client.post("/api/demo/session", json={"role": "student", "student_id": "std-1"})
            student = client.get(f"/api/materials/{mid}").json()["variants"]["std-1"]
            self.assertNotIn("reconstruction", student)
            self.assertEqual(student["source_pdf_url"], civil_trial.PDF_URL)
            self.assertTrue(any(s["explanation"] == "교사가 확인한 쉬운 설명입니다." for s in student["reading_support"]))
            self.assertTrue(all(not s["explanation"] for s in student["reading_support"] if s["activity"]))
            self.assertNotIn("rationale", str(student["reading_support"]))


if __name__ == "__main__":
    unittest.main()
