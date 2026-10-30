import copy
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.l2.models import AnalyzeInput, AnalysisOutput
from app.l2.workflow import GLOSSARY, prepare_request, normalize_output
from app.main import create_app
from app.l1.models import LearnerProfile
from app.l1.workflow import prepare_request as prepare_l1, demo_output as demo_l1, normalize_output as normalize_l1
from app.solar_agent import SolarLearningAgent

DOCUMENT = "원고: 被告\n원고는 법원에 소송을 제기하는 사람입니다.\n피고: 被告\n피고는 제기된 소송의 상대방입니다."


def input_data(**kwargs):
    return AnalyzeInput(document_text=DOCUMENT, language="zh", **kwargs)


def output_data(**kwargs):
    return AnalysisOutput.model_validate({"summary": "재판 당사자의 번역을 검토합니다.", "subject": "사회", "subject_confidence": .9,
        "unit": "재판", "unit_confidence": .9, "items": [], "weak_candidates": [], **kwargs})


def candidate():
    return {"term": "원고", "wrong": "被告", "correct": "임의의 정답을 표시하면 안 됨", "status": "confirmed", "severity": "S1",
        "segment_id": "p1", "quote": "원고: 被告", "reason": "표의 원고 대역과 다르고 소송을 제기한다는 정의와 함께 검토가 필요합니다.",
        "cause": "당사자 역할을 혼동했을 가능성", "cause_code": "E1", "signals": [
            {"kind": "glossary_mismatch", "segment_id": "p1", "quote": "원고: 被告", "explanation": "이미지 표의 原告와 다릅니다."},
            {"kind": "definition_conflict", "segment_id": "p2", "quote": "원고는 법원에 소송을 제기하는 사람입니다.", "explanation": "원고의 정의를 번역 문구와 함께 대조해야 합니다."}]}


class L2Tests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"IEUM_AGENT_PROVIDER": "demo", "IEUM_DEMO_ENABLED": "true", "UPSTAGE_API_KEY": "test-only"})
        env.start(); self.addCleanup(env.stop)
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.path = str(Path(temp.name) / "test.db")
        self.requests = []

    def client(self, agent=None):
        client = TestClient(create_app(self.path, agent)); client.__enter__()
        self.addCleanup(client.__exit__, None, None, None)
        return client

    def login(self, client, role="teacher"):
        self.assertEqual(client.post("/api/demo/session", json={"role": role}).status_code, 200)

    def solar(self, output=None, response_status=200):
        def handle(request):
            self.requests.append(json.loads(request.content))
            if response_status != 200:
                return httpx.Response(response_status, text="private upstream data")
            value = (output or output_data(items=[candidate()])).model_dump()
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(value, ensure_ascii=False)}}]})
        return SolarLearningAgent(transport=httpx.MockTransport(handle))

    def normalize(self, raw, data=None):
        data = data or input_data()
        return normalize_output(raw, data, prepare_request(data), "solar")

    def test_image_transcription_is_preserved_as_unreviewed_data(self):
        self.assertEqual(len(GLOSSARY["entries"]), 3)
        self.assertEqual(list(GLOSSARY["languages"]), ["vi", "zh", "ru", "ja", "mn"])
        self.assertEqual(GLOSSARY["verification"], "unreviewed")
        values = [e["translations"] for e in GLOSSARY["entries"]]
        self.assertEqual([v["vi"] for v in values], ["nguyên cáo", "bị cáo", "người đại diện trong tố tụng"])
        self.assertEqual([v["mn"] for v in values], ["нэхэмжлэгч", "хэрэгтэн", "нэхэмжлэл орлогч"])
        self.assertEqual(values[2]["ru"], "иск представитель")
        self.assertEqual(values[2]["zh"], "诉讼代理人")
        self.assertEqual(values[2]["ja"], "訴訟代理人")

    def test_l1_can_reference_the_same_table_without_inventing_levels(self):
        request = prepare_l1(LearnerProfile(native_language="중국어"), DOCUMENT, "사회", "법정 용어", "teacher")
        entries = request["vocabulary_lexicon"]["entries"]
        self.assertEqual(next(e for e in entries if e["term"] == "원고")["translations"]["zh"], "原告")
        self.assertTrue(all("required_level" not in e and "tier" not in e for e in entries))
        output = normalize_l1(demo_l1(request), request)
        term = next(t for t in output["vocabulary"] if t["term"] == "원고")
        self.assertEqual(term["translation"], "原告")
        self.assertEqual(term["tier"], "unknown_needs_teacher")
        self.assertIsNone(term["required_level"])

    def test_low_confidence_clears_all_items_and_counts_then_selection_allows_retry(self):
        raw = output_data(subject_confidence=.69, unit_confidence=.59, items=[candidate()], weak_candidates=[{
            "term": "원고", "wrong": "被告", "segment_id": "p1", "quote": "원고: 被告", "signal": candidate()["signals"][0]}])
        result = self.normalize(raw)
        self.assertTrue(result["needs_selection"])
        self.assertFalse(result["items"])
        self.assertFalse(result["weak_candidates"])
        self.assertEqual(sum(result["counts"].values()), 0)
        result = self.normalize(raw, input_data(subject="사회", unit="민사 재판"))
        self.assertFalse(result["needs_selection"])
        self.assertEqual(result["unit"], "민사 재판")
        self.assertEqual(result["context_source"], {"subject": "teacher", "unit": "teacher"})
        self.assertEqual(result["counts"]["suspected"], 1)

    def test_duplicate_evidence_and_usage_subtypes_do_not_confirm(self):
        item = candidate()
        item["signals"] = [copy.deepcopy(item["signals"][0]) for _ in range(3)]
        result = self.normalize(output_data(items=[item]))
        self.assertEqual(result["counts"]["weak"], 1)
        self.assertEqual(result["counts"]["confirmed"], 0)
        item["signals"][1].update(kind="semantic_field")
        result = self.normalize(output_data(items=[item]))
        self.assertEqual(result["weak_candidates"][0]["independent_signal_count"], 1)
        item["signals"] = [{**candidate()["signals"][0], "kind": "semantic_field"}, {**candidate()["signals"][1], "kind": "collocation"}]
        self.assertEqual(self.normalize(output_data(items=[item]))["counts"]["weak"], 1)

    def test_valid_evidence_is_provisional_and_occurrences_are_derived(self):
        result = self.normalize(output_data(items=[candidate(), candidate()]))
        self.assertEqual(result["counts"]["suspected"], 1)
        self.assertEqual(result["counts"]["confirmed"], 0)
        item = result["items"][0]
        self.assertEqual(item["correct"], "原告")
        self.assertEqual(item["reference_verification"], "unreviewed")
        self.assertEqual(item["occurrences"], 2)
        self.assertEqual(len(item["locations"]), 2)
        self.assertIsNone(item["cause_code"])
        self.assertTrue(item["cause_is_hypothesis"])

    def test_correct_pair_not_flagged_and_unknown_reference_never_invents_correction(self):
        item = candidate()
        item.update(term="피고", segment_id="p3", quote="피고: 被告")
        item["signals"] = [{**item["signals"][0], "segment_id": "p3", "quote": "피고: 被告"}]
        result = self.normalize(output_data(items=[item]))
        self.assertFalse(result["items"] or result["weak_candidates"])
        item = candidate()
        result = self.normalize(output_data(items=[item]), input_data(mode="standalone"))
        self.assertEqual(result["counts"]["confirmed"], 0)
        self.assertEqual(result["weak_candidates"][0]["correct"], "")
        result = self.normalize(output_data(items=[item]), input_data(mode="standalone").model_copy(update={"language": "uz"}))
        self.assertIsNone(result["weak_candidates"][0]["reference_translation"])
        self.assertEqual(result["weak_candidates"][0]["correct"], "")
        self.assertTrue(any("대역표가 없습니다" in w for w in result["warnings"]))

    def test_recognition_is_not_a_translation_count_and_fabricated_quotes_are_discarded(self):
        item = candidate()
        item["signals"] = [{**item["signals"][0], "kind": "recognition"}]
        result = self.normalize(output_data(items=[item]))
        self.assertEqual(result["counts"], {"confirmed": 0, "suspected": 0, "review": 0, "recognition": 1, "weak": 0})
        self.assertEqual(result["items"][0]["severity"], "S3")
        self.assertEqual(result["items"][0]["correct"], "")
        item["quote"] = "원문에 없는 인용입니다."
        result = self.normalize(output_data(items=[item]))
        self.assertEqual(sum(result["counts"].values()), 0)
        self.assertTrue(any("제외했습니다" in w for w in result["warnings"]))

    def test_teacher_access_persistence_and_source_material_is_not_modified(self):
        client = self.client(self.solar())
        data = input_data().model_dump()
        self.assertEqual(client.post("/api/translation-reviews", json=data).status_code, 401)
        self.login(client, "student")
        self.assertEqual(client.get("/api/translation-review/glossary").status_code, 403)
        self.assertEqual(client.get("/api/translation-reviews").status_code, 403)
        self.assertEqual(client.post("/api/translation-reviews", json=data).status_code, 403)
        self.assertEqual(self.requests, [])
        self.login(client)
        before = client.get("/api/materials/lesson-demo").json()
        data["material_id"] = "lesson-demo"
        response = client.post("/api/translation-reviews", json=data)
        self.assertEqual(response.status_code, 201, response.text)
        report = response.json()
        rid = report["id"]
        self.assertEqual(client.get("/api/materials/lesson-demo").json(), before)
        request = json.loads(self.requests[0]["messages"][1]["content"])
        self.assertNotIn("material_id", request)
        self.assertEqual({e["translation"] for e in request["glossary"]}, {"原告", "被告", "诉讼代理人"})
        self.assertEqual(client.get(f"/api/translation-reviews/{rid}").json()["document_text"], DOCUMENT)
        second = self.client(); self.login(second)
        self.assertEqual(second.get(f"/api/translation-reviews/{rid}").json()["result"], report["result"])
        self.login(client, "student")
        self.assertEqual(client.get(f"/api/translation-reviews/{rid}").status_code, 403)

    def test_invalid_inputs_and_upstream_errors_do_not_save_results(self):
        client = self.client(self.solar(response_status=401)); self.login(client)
        data = input_data().model_dump()
        for patch_data in [{"language": "xx"}, {"mode": "invalid"}, {"document_text": "短"}, {"document_text": "a" * 40001}, {"unexpected": True}]:
            with self.subTest(patch_data=list(patch_data)):
                self.assertEqual(client.post("/api/translation-reviews", json={**data, **patch_data}).status_code, 422)
        self.assertFalse(self.requests)
        self.assertEqual(client.post("/api/translation-reviews", json={**data, "material_id": "missing"}).status_code, 404)
        response = client.post("/api/translation-reviews", json=data)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private upstream", response.text)
        self.assertEqual(client.get("/api/translation-reviews").json(), [])

    def test_demo_and_pdf_page_markers_work_without_external_calls(self):
        client = self.client(); self.login(client)
        response = client.post("/api/translation-reviews", json=input_data(subject="사회", unit="재판").model_dump())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["result"]["counts"]["weak"], 1)
        self.assertEqual(response.json()["result"]["provider"], "demo")
        writer = PdfWriter()
        for text in (b'Civil court: the plaintiff files a claim.', b'The defendant responds to the claim.'):
            page = writer.add_blank_page(width=400, height=400)
            font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
            stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 20 200 Td (' + text + b') Tj ET')
            page[NameObject('/Contents')] = stream
        out = io.BytesIO(); writer.write(out)
        response = client.post("/api/extract?include_page_markers=true", files={"file": ("lesson.pdf", out.getvalue(), "application/pdf")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("[쪽 2]", response.json()["text"])
        pages = prepare_request(AnalyzeInput(document_text=response.json()["text"], language="en"))["segments"]
        self.assertEqual([p["page"] for p in pages], [1, 2])
        self.assertEqual(client.post("/api/extract?include_page_markers=true", files={"file": ("bad.pdf", b'bad', "application/pdf")}).status_code, 415)


if __name__ == "__main__":
    unittest.main()
