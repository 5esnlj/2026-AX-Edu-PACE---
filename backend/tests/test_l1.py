import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.agents import SAMPLE_TEXT
from app.database import initialize
from app.l1.models import LearnerProfile, ReconstructionOutput
from app.l1.workflow import ROOT, prepare_request, demo_output, normalize_output
from app.main import create_app
from app.solar_agent import SolarLearningAgent


def sample_profile():
    return json.loads((ROOT / "data/learners.example.json").read_text())["learners"][0]


def to_edits(output):
    return {
        "sentences": [{k: s[k] for k in ("id", "rewritten")} for s in output["key_sentences"]],
        "vocabulary": [{k: v[k] for k in ("term", "tier", "action", "simple_meaning", "translation")} for v in output["vocabulary"]],
        "visual_aids": [{k: v[k] for k in ("title", "description", "items", "alt_text", "visible_by_default")} for v in output["visual_aids"]],
    }


class L1Tests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"IEUM_AGENT_PROVIDER": "demo", "IEUM_DEMO_ENABLED": "true", "UPSTAGE_API_KEY": "test-key"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = str(Path(folder.name) / "l1.db")
        self.requests = []

    def client(self, agent=None):
        client = TestClient(create_app(self.path, agent))
        client.__enter__()
        self.addCleanup(client.__exit__, None, None, None)
        return client

    def login(self, client, role="teacher", sid="std-1"):
        self.assertEqual(client.post("/api/demo/session", json={"role": role, "student_id": sid}).status_code, 200)

    def create(self, client, targets=None):
        return client.post("/api/materials", json={"title": "L1 자료", "subject": "사회", "source_text": SAMPLE_TEXT,
            "targets": targets or ["std-1"], "modes": ["easy", "bilingual", "visual"], "workflow": "teacher_l1"})

    def solar(self, mutate=lambda output: None):
        def handler(request):
            payload = json.loads(request.content)
            self.requests.append(payload)
            data = json.loads(payload["messages"][1]["content"])
            output = demo_output(data).model_dump()
            output["key_sentences"] = output["key_sentences"][:1]  # Remaining source must survive.
            output["key_sentences"][0]["rewritten"] = "민주주의는 국민이 중요한 일을 함께 결정하는 정치 제도입니다."
            output["key_sentences"][0]["operations"] = ["elaborate"]
            output["learner_decision"]["methods_selected"] = ["easy", "bilingual", "visual"]
            output["visual_aids"] = [{"needed": True, "kind": "list", "title": "민주주의", "description": "중요한 일을 함께 결정해요.",
                "items": ["국민", "중요한 일 결정"], "source_sentence_ids": ["s1"], "alt_text": "국민이 나라의 중요한 일을 결정합니다.",
                "visible_by_default": True, "rationale": "원문의 핵심 관계를 목록으로 확인합니다."}]
            mutate(output)
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(output, ensure_ascii=False)}}]})
        return SolarLearningAgent(transport=httpx.MockTransport(handler))

    def test_profile_import_is_teacher_only_persistent_and_does_not_change_app_scale(self):
        client = self.client()
        endpoint = "/api/students/std-1/reconstruction-profile"
        self.assertEqual(client.get(endpoint).status_code, 401)
        self.login(client, "student")
        self.assertEqual(client.get(endpoint).status_code, 403)
        self.assertEqual(client.put(endpoint, json=sample_profile()).status_code, 403)
        self.assertEqual(client.get("/api/l1/example-profile").status_code, 403)
        self.login(client)
        before = client.get("/api/students").json()
        self.assertEqual(client.get(endpoint).json()["profile"]["level_scale"], "app_1_4")
        response = client.put(endpoint, json=sample_profile())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["profile"]["level_scale"], "diagnostic_1_6")
        self.assertEqual(client.get("/api/students").json(), before)
        initialize(self.path)  # Safe additive schema initialization on an existing database.
        second = self.client()
        self.login(second)
        self.assertEqual(second.get(endpoint).json()["profile"]["subject_profiles"]["사회"]["representative_level"], "≤3")
        self.assertEqual(client.put(endpoint, json=dict(sample_profile(), overall_korean_level=7)).status_code, 422)
        self.assertEqual(client.delete(endpoint).status_code, 200)
        self.assertEqual(client.get(endpoint).json()["source"], "app")

    def test_solar_receives_anonymous_profile_and_cannot_approve_or_invent_levels(self):
        def spoof(output):
            output.update(status="teacher_approved")
            output["finalization"] = {"approved_by_teacher": True, "final_document": "임의 승인"}
            output["learner_decision"].update(diagnosed_level=1, native_language="영어")
            output["vocabulary"][0].update(tier="3", required_level=6, learner_level=1, knowledge_state="known")
        client = self.client(self.solar(spoof))
        self.login(client)
        client.put("/api/students/std-1/reconstruction-profile", json=sample_profile())
        response = self.create(client)
        self.assertEqual(response.status_code, 201, response.text)
        variant = response.json()["variants"]["std-1"]
        output = variant["reconstruction"]
        data = json.loads(self.requests[0]["messages"][1]["content"])
        self.assertNotIn("learner_id", data["learner_profile"])
        self.assertNotIn("display_name", data["learner_profile"])
        self.assertNotIn("std-1", json.dumps(data))
        self.assertEqual(data["learner_profile"]["academic_korean"]["C"], 4)
        self.assertEqual(data["subject"], "사회")
        self.assertEqual(output["learner_decision"]["diagnosed_level"], 5)
        self.assertEqual(variant["native_language"], "중국어")
        self.assertEqual(output["status"], "teacher_review_required")
        self.assertFalse(output["finalization"]["approved_by_teacher"])
        self.assertIsNone(output["finalization"]["final_document"])
        self.assertEqual(output["vocabulary"][0]["tier"], "unknown_needs_teacher")
        self.assertIsNone(output["vocabulary"][0]["required_level"])
        self.assertEqual(output["vocabulary"][0]["knowledge_state"], "unmarked")
        self.assertIn("시민 참여는 투표뿐만 아니라", variant["text"])
        self.assertEqual(client.post(f"/api/materials/{response.json()['id']}/publish").status_code, 409)

    def test_source_and_evidence_failures_are_not_saved(self):
        mutations = [
            lambda o: o["key_sentences"][0].update(source="원문에 없는 내용"),
            lambda o: o["key_sentences"].append(copy.deepcopy(o["key_sentences"][0])),
            lambda o: o["vocabulary"][0].update(source_sentence_ids=["s999"]),
            lambda o: o["visual_aids"][0].update(source_sentence_ids=["s999"]),
            lambda o: o["key_sentences"][0].update(operations=["simplify"]),
            lambda o: o["recognition"].update(status="failed"),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                client = self.client(self.solar(mutate))
                self.login(client)
                before = client.get("/api/materials").json()
                self.assertEqual(self.create(client).status_code, 422)
                self.assertEqual(client.get("/api/materials").json(), before)

    def test_teacher_edits_approval_and_student_projection(self):
        client = self.client(self.solar())
        self.login(client)
        response = self.create(client)
        self.assertEqual(response.status_code, 201, response.text)
        item = response.json()
        mid = item["id"]
        edits = to_edits(item["variants"]["std-1"]["reconstruction"])
        edits["sentences"][0]["rewritten"] = "민주주의에서는 국민이 나라의 중요한 일을 함께 결정해요."
        edits["vocabulary"][0].update(tier="3", action="elaborate", translation="교사 확인 번역", simple_meaning="교사 확인 뜻")
        edits["visual_aids"][0].update(title="교사가 수정한 목록", items=["국민", "함께 결정"], alt_text="함께 결정하는 국민")
        endpoint = f"/api/materials/{mid}/review"
        self.assertEqual(client.patch(endpoint, json={"student_id": "std-1", "confirmed": True, "text": "옛 방식으로 덮어쓸 수 없는 자료입니다."}).status_code, 422)
        for confirmed in (False, True, False, True):
            response = client.patch(endpoint, json={"student_id": "std-1", "confirmed": confirmed, "reconstruction_edits": edits})
            self.assertEqual(response.status_code, 200, response.text)
            variant = response.json()["variants"]["std-1"]
            self.assertEqual(variant["reconstruction"]["finalization"]["approved_by_teacher"], confirmed)
            self.assertEqual(variant["terms"][0]["meaning"], "교사 확인 뜻")
            self.assertEqual(variant["visuals"][0]["term"], "교사가 수정한 목록")
            if not confirmed:
                self.assertEqual(client.post(f"/api/materials/{mid}/publish").status_code, 409)
        invalid = copy.deepcopy(edits)
        invalid["sentences"][0]["rewritten"] = "이 제도에서는 국민이 나라의 중요한 일을 함께 결정해요."
        self.assertEqual(client.patch(endpoint, json={"student_id": "std-1", "confirmed": True, "reconstruction_edits": invalid}).status_code, 422)
        invalid = copy.deepcopy(edits)
        invalid["finalization"] = {"approved_by_teacher": True}
        self.assertEqual(client.patch(endpoint, json={"student_id": "std-1", "confirmed": True, "reconstruction_edits": invalid}).status_code, 422)
        self.assertEqual(client.post(f"/api/materials/{mid}/publish").status_code, 200)
        self.login(client, "student")
        public = client.get(f"/api/materials/{mid}").json()["variants"]["std-1"]
        self.assertNotIn("reconstruction", public)
        self.assertEqual(public["terms"][0]["translation"], "교사 확인 번역")
        self.assertIn("함께 결정해요", public["text"])
        self.assertIn("시민 참여는 투표뿐만 아니라", public["text"])
        self.login(client, "student", "std-2")
        self.assertEqual(client.get(f"/api/materials/{mid}").status_code, 404)
        self.login(client)
        self.assertEqual(client.patch(endpoint, json={"student_id": "std-1", "confirmed": False, "reconstruction_edits": edits}).status_code, 409)

    def test_missing_native_language_and_known_words_are_not_guessed(self):
        client = self.client(self.solar())
        self.login(client, "student")
        client.put("/api/learning/lesson-demo", json={"known": ["민주주의"], "unknown": ["국민"], "notes": ""})
        self.login(client)
        client.put("/api/students/std-1/reconstruction-profile", json=dict(sample_profile(), native_language=None))
        response = self.create(client)
        self.assertEqual(response.status_code, 201, response.text)
        output = response.json()["variants"]["std-1"]["reconstruction"]
        self.assertNotIn("bilingual", output["learner_decision"]["methods_selected"])
        terms = {v["term"]: v for v in output["vocabulary"]}
        self.assertEqual(terms["민주주의"]["knowledge_state"], "known")
        self.assertEqual(terms["국민"]["knowledge_state"], "unknown")
        self.assertTrue(all(not v["translation"] for v in terms.values()))

    def test_lexicon_backs_levels_and_preserves_known_concepts(self):
        request = prepare_request(LearnerProfile.model_validate(sample_profile()), SAMPLE_TEXT, "사회", "제목", "teacher")
        request["vocabulary_lexicon"] = {"entries": [{"term": "민주주의", "tier": "3", "required_level": 3}]}
        raw = demo_output(request)
        result = normalize_output(raw, request)
        self.assertEqual(result["vocabulary"][0]["learner_level"], 4)
        self.assertEqual(result["vocabulary"][0]["action"], "retain")
        raw.key_sentences[0].rewritten = "나라의 중요한 일은 국민이 결정합니다."
        with self.assertRaises(ValueError):
            normalize_output(raw, request)

    def test_demo_fallback_stays_on_app_scale_and_works_without_api_key(self):
        with patch.dict(os.environ, {"UPSTAGE_API_KEY": ""}):
            client = self.client()
        self.login(client)
        response = self.create(client)
        self.assertEqual(response.status_code, 201, response.text)
        variant = response.json()["variants"]["std-1"]
        self.assertEqual(variant["provider"], "demo")
        self.assertEqual(variant["reconstruction"]["profile_context"]["level_scale"], "app_1_4")
        self.assertIsNone(variant["reconstruction"]["learner_decision"]["diagnosed_level"])
        self.assertEqual(variant["reconstruction"]["profile_context"]["bottlenecks"], [])


if __name__ == "__main__":
    unittest.main()
