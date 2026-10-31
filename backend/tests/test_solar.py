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
from app.agents import DemoLearningAgent, SAMPLE_TEXT
from app.main import create_app
from app.solar_agent import SolarAgentError, SolarLearningAgent


def material_output():
    return {"text": "민주주의에서는 국민이 나라의 일을 함께 정해요.",
            "terms": [{"term": "민주주의", "meaning": "국민이 함께 정하는 제도", "translation": "democracy"}],
            "visuals": [{"term": "민주주의", "meaning": "모두 한 표씩 투표해요."}]}


def quiz_output():
    return {"questions": [{k: v for k, v in q.items() if k != "id"}
                          for q in DemoLearningAgent().questions(SAMPLE_TEXT)]}


def completion(value):
    return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(value, ensure_ascii=False)}}]})


class SolarTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "IEUM_AGENT_PROVIDER": "solar", "IEUM_DEMO_ENABLED": "true",
            "UPSTAGE_API_KEY": "test-key-never-real", "SOLAR_MODEL": "solar-test-model",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.requests = []

    def agent(self, response=None):
        def handler(request):
            self.requests.append(request)
            if callable(response):
                return response(request)
            return response if response is not None else completion(material_output())
        return SolarLearningAgent(transport=httpx.MockTransport(handler))

    def client(self, agent):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        client = TestClient(create_app(str(Path(folder.name) / "test.db"), agent))
        client.__enter__()
        self.addCleanup(client.__exit__, None, None, None)
        return client

    def login(self, client, role="teacher"):
        self.assertEqual(client.post("/api/demo/session", json={"role": role}).status_code, 200)

    def create_material(self, client, targets=None):
        return client.post("/api/materials", json={
            "title": "새 수업", "subject": "사회", "source_text": SAMPLE_TEXT,
            "targets": targets or ["std-1"], "modes": ["easy", "bilingual", "visual"],
        })

    def test_teacher_connection_probe_uses_selected_model_without_lesson_data(self):
        client = self.client(self.agent(completion({"reply": "ok"})))
        self.assertEqual(client.post('/api/agent/check').status_code, 401)
        self.login(client, 'student')
        self.assertEqual(client.post('/api/agent/check').status_code, 403)
        self.login(client)
        self.assertTrue(client.get('/api/health').json()['configured'])
        self.assertEqual(self.requests, [])
        result = client.post('/api/agent/check')
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['connected'])
        self.assertEqual(result.json()['model'], 'solar-test-model')
        payload = json.loads(self.requests[0].content)
        self.assertEqual(payload['max_tokens'], 64)
        self.assertEqual(json.loads(payload['messages'][1]['content']), {'purpose':'connection_check'})
        self.assertNotIn('test-key-never-real', result.text)

    def test_connection_probe_reports_demo_missing_key_and_upstream_failures(self):
        demo = self.client(DemoLearningAgent())
        self.login(demo)
        self.assertEqual(demo.post('/api/agent/check').status_code, 409)
        with patch.dict(os.environ, {'UPSTAGE_API_KEY': ''}):
            missing = self.client(self.agent())
        self.login(missing)
        self.assertEqual(missing.post('/api/agent/check').status_code, 503)
        self.assertEqual(self.requests, [])
        for response, status, message in [
            (httpx.Response(401, text='private-upstream-secret'), 502, '인증'),
            (httpx.Response(429, text='private-upstream-secret'), 503, '한도'),
            (completion({'unexpected':'private-upstream-secret'}), 502, '형식'),
        ]:
            client = self.client(self.agent(response))
            self.login(client)
            result = client.post('/api/agent/check')
            self.assertEqual(result.status_code, status)
            self.assertIn(message, result.json()['detail'])
            self.assertNotIn('private-upstream-secret', result.text)

    def test_request_contract_and_unreviewed_output(self):
        result = self.agent().reconstruct(SAMPLE_TEXT, 2, "en", ["easy", "bilingual", "visual"])
        request = self.requests[0]
        self.assertEqual(str(request.url), "https://api.upstage.ai/v1/solar/chat/completions")
        self.assertEqual(request.headers["authorization"], "Bearer test-key-never-real")
        payload = json.loads(request.content)
        self.assertEqual(payload["model"], "solar-test-model")
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertFalse(payload["stream"])
        data = json.loads(payload["messages"][1]["content"])
        self.assertEqual(set(data), {"source", "reading_level", "target_language", "modes"})
        self.assertEqual(data["reading_level"], 2)
        self.assertEqual(data["target_language"], "영어")
        self.assertEqual(result["provider"], "solar")
        self.assertFalse(result["terms"][0]["verified"])
        self.assertEqual(result["terms"][0]["translations"], {"en": "democracy"})
        self.assertNotIn("test-key-never-real", json.dumps(result))

    def test_unselected_modes_preserve_source_and_hide_generated_fields(self):
        for modes in (["visual"], ["bilingual"], ["easy"]):
            with self.subTest(modes=modes):
                result = self.agent().reconstruct(SAMPLE_TEXT, 1, "vi", modes)
                if "easy" not in modes:
                    self.assertEqual(result["text"], SAMPLE_TEXT)
                if "bilingual" not in modes:
                    self.assertEqual(result["terms"], [])
                if "visual" not in modes:
                    self.assertEqual(result["visuals"], [])

    def test_missing_key_does_not_call_upstream_and_health_is_not_authentication(self):
        with patch.dict(os.environ, {"UPSTAGE_API_KEY": ""}):
            client = self.client(self.agent())
        health = client.get("/api/health").json()
        self.assertEqual(health["provider"], "solar")
        self.assertFalse(health["configured"])
        self.login(client)
        self.assertEqual(self.create_material(client).status_code, 503)
        self.assertEqual(self.requests, [])

    def test_provider_selection_and_explicit_demo_mode(self):
        with patch.dict(os.environ, {"IEUM_AGENT_PROVIDER": "demo"}):
            client = self.client(None)
            self.assertEqual(client.get("/api/health").json()["provider"], "demo")
        client = self.client(None)
        health = client.get("/api/health").json()
        self.assertEqual(health["provider"], "solar")
        self.assertTrue(health["configured"])
        self.assertNotIn("test-key-never-real", json.dumps(health))
        with patch.dict(os.environ, {"IEUM_AGENT_PROVIDER": "solra"}):
            with self.assertRaises(ValueError):
                create_app()

    def test_upstream_errors_are_actionable_and_do_not_leak_response(self):
        for status, expected in [(401, 502), (403, 502), (429, 503), (400, 502), (404, 502), (500, 502), (302, 502)]:
            with self.subTest(status=status):
                agent = self.agent(httpx.Response(status, text="test-key-never-real private lesson"))
                with self.assertRaises(SolarAgentError) as context:
                    agent.reconstruct(SAMPLE_TEXT, 1, "vi", ["easy"])
                self.assertEqual(context.exception.status_code, expected)
                self.assertNotIn("test-key-never-real", str(context.exception))
                self.assertNotIn("private lesson", str(context.exception))
        self.assertEqual(len(self.requests), 7)  # No automatic paid retries.

    def test_timeout_and_connection_failure(self):
        for error, status in [(httpx.ReadTimeout, 504), (httpx.ConnectError, 503)]:
            def fail(request):
                raise error("sensitive upstream details", request=request)
            with self.subTest(error=error), self.assertRaises(SolarAgentError) as context:
                self.agent(fail).questions(SAMPLE_TEXT)
            self.assertEqual(context.exception.status_code, status)
            self.assertNotIn("sensitive", str(context.exception))

    def test_malformed_materials_are_rejected(self):
        duplicate = material_output()
        duplicate["terms"] *= 2
        responses = [
            httpx.Response(200, text="not json"),
            httpx.Response(200, json={"choices": []}),
            httpx.Response(200, json={"choices": [None]}),
            httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}),
            completion({}), completion(dict(material_output(), text=" ")),
            completion(dict(material_output(), terms=[{"term": "x"}])), completion(duplicate),
            completion(dict(material_output(), verified=True)),
        ]
        for response in responses:
            with self.subTest(response=response.text[:40]), self.assertRaises(SolarAgentError):
                self.agent(response).reconstruct(SAMPLE_TEXT, 1, "vi", ["easy"])

    def test_quiz_requires_two_pairs_valid_answers_and_distinct_options(self):
        mutations = [
            lambda q: q.pop(),
            lambda q: q[0].update(answer=True),
            lambda q: q[0].update(answer=3),
            lambda q: q[0].update(options=["같음", "같음", "다름"]),
            lambda q: q[0].update(load="reduced"),
            lambda q: q[0].update(concept="다른 개념"),
        ]
        for mutate in mutations:
            output = copy.deepcopy(quiz_output())
            mutate(output["questions"])
            with self.subTest(output=output), self.assertRaises(SolarAgentError):
                self.agent(completion(output)).questions(SAMPLE_TEXT)

    def test_failed_generation_is_atomic_and_roles_block_paid_calls(self):
        def respond(request):
            return completion(material_output()) if len(self.requests) == 1 else httpx.Response(429)
        client = self.client(self.agent(respond))
        self.assertEqual(self.create_material(client).status_code, 401)
        self.login(client, "student")
        self.assertEqual(self.create_material(client).status_code, 403)
        self.assertEqual(self.requests, [])
        self.login(client)
        before = client.get("/api/materials").json()
        self.assertEqual(self.create_material(client, ["std-1", "std-2"]).status_code, 503)
        self.assertEqual(client.get("/api/materials").json(), before)

    def test_solar_review_publish_quiz_and_answer_secrecy(self):
        def respond(request):
            return completion(material_output() if len(self.requests) == 1 else quiz_output())
        client = self.client(self.agent(respond))
        self.login(client)
        response = self.create_material(client)
        self.assertEqual(response.status_code, 201, response.text)
        item = response.json()
        mid = item["id"]
        self.assertEqual(item["reviewed"], [])
        self.assertEqual(client.post(f"/api/materials/{mid}/publish").status_code, 409)
        client.patch(f"/api/materials/{mid}/review", json={"student_id": "std-1", "text": item["variants"]["std-1"]["text"], "confirmed": True})
        self.assertEqual(client.post(f"/api/materials/{mid}/publish").status_code, 200)
        response = client.post(f"/api/materials/{mid}/quiz")
        self.assertEqual(response.status_code, 201, response.text)
        qid = response.json()["id"]
        self.assertEqual(client.post(f"/api/materials/{mid}/quiz").json()["id"], qid)
        self.assertEqual(len(self.requests), 2)
        self.login(client, "student")
        questions = client.get(f"/api/quizzes/{qid}").json()["questions"]
        self.assertEqual([q["id"] for q in questions], ["q1", "q2", "q3", "q4"])
        for q in questions:
            self.assertNotIn("answer", q)
            self.assertNotIn("explanation", q)
        result = client.post(f"/api/quizzes/{qid}/submit", json={"answers": {"q1": 0, "q2": 1, "q3": 2, "q4": 0}})
        self.assertEqual(result.json()["score"], 4)


if __name__ == "__main__":
    unittest.main()
