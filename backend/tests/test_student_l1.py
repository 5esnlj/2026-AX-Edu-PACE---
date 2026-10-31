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
from app.agents import DemoLearningAgent
from app.database import connect
from app.main import create_app
from app.solar_agent import SolarLearningAgent
from app.student_l1.workflow import demo_material, demo_assessment, normalize_assessment

SOURCE = '민사 재판은 개인 사이의 분쟁을 해결하는 재판입니다. 원고는 소송을 제기한 사람입니다. 피고는 소송을 당한 사람입니다.'
INPUT = {'title': '민사 재판 공부', 'subject': '사회', 'source_text': SOURCE}


class StudentL1Tests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'IEUM_AGENT_PROVIDER': 'demo', 'IEUM_DEMO_ENABLED': 'true', 'UPSTAGE_API_KEY': 'test-not-real'})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = str(Path(self.folder.name) / 'test.db')

    def client(self, agent=None):
        client = TestClient(create_app(self.path, agent or DemoLearningAgent()))
        client.__enter__()
        self.addCleanup(client.__exit__, None, None, None)
        return client

    def login(self, client, sid='std-example-a', role='student'):
        self.assertEqual(client.post('/api/demo/session', json={'role': role, 'student_id': sid}).status_code, 200)

    def create(self, client):
        response = client.post('/api/student-materials', json=INPUT)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_private_ownership_and_six_level_profile(self):
        client = self.client()
        self.assertEqual(client.get('/api/student-materials').status_code, 401)
        self.login(client, role='teacher')
        self.assertEqual(client.post('/api/student-materials', json=INPUT).status_code, 403)
        self.login(client)
        lesson = self.create(client)
        self.assertEqual(lesson['profile'], {'level': 5, 'native_language': '중국어'})
        self.assertEqual(lesson['result']['provider'], 'demo')
        self.assertEqual(lesson['result']['sentences'][0]['source'], lesson['result']['sentences'][0]['rewritten'])
        mid = lesson['id']
        self.login(client, 'std-1')
        self.assertEqual(client.get('/api/student-materials').json(), [])
        for path, body in [('', None), ('/complete', {}), ('/quiz', {'opt_in': True}), ('/quiz/submit', {'answers': {'q1':'O'}})]:
            response = client.get('/api/student-materials/'+mid) if body is None else client.post('/api/student-materials/'+mid+path, json=body)
            self.assertEqual(response.status_code, 404)
        self.assertEqual(client.post('/api/student-materials', json=dict(INPUT, student_id='std-example-a')).status_code, 422)
        self.login(client)
        self.assertEqual(len(client.get('/api/student-materials').json()), 1)
        # SQLite initialization on restart preserves student material records.
        second = self.client()
        self.login(second)
        self.assertEqual(second.get('/api/student-materials/'+mid).json()['id'], mid)

    def test_completion_opt_in_answer_secrecy_and_score_does_not_change_diagnosis(self):
        client = self.client()
        self.login(client)
        mid = self.create(client)['id']
        base = '/api/student-materials/'+mid
        with connect(self.path) as db:
            before = db.execute("SELECT diagnostic_summary FROM students WHERE id='std-example-a'").fetchone()[0]
        self.assertEqual(client.post(base+'/quiz', json={'opt_in': True}).status_code, 409)
        client.post(base+'/complete')
        self.assertEqual(client.post(base+'/quiz', json={'opt_in': False}).status_code, 409)
        self.assertEqual(client.post(base+'/quiz', json={'opt_in': 'true'}).status_code, 422)
        response = client.post(base+'/quiz', json={'opt_in': True})
        self.assertEqual(response.status_code, 201, response.text)
        for response in [response, client.get(base), client.get('/api/student-materials')]:
            for field in ['correct_answer', 'accepted_answers', 'explanation', 'source_sentence_ids', 'learning_objective']:
                self.assertNotIn(field, response.text)
        quiz = client.get(base).json()['quiz']
        self.assertEqual(client.post(base+'/quiz/submit', json={'answers': {'fake': 'O'}}).status_code, 422)
        answers = {item['id']: 'O' for item in quiz['items']}
        result = client.post(base+'/quiz/submit', json={'answers': answers})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['score'], result.json()['total'])
        self.assertIn('correct_answer', result.text)
        self.assertIsNotNone(client.get(base).json()['attempt'])
        with connect(self.path) as db:
            after = db.execute("SELECT diagnostic_summary FROM students WHERE id='std-example-a'").fetchone()[0]
        self.assertEqual(before, after)

    def test_unknown_diagnosis_preserves_original_without_model_call_and_blocks_quiz(self):
        calls = []
        agent = SolarLearningAgent(transport=httpx.MockTransport(lambda r: calls.append(r)))
        client = self.client(agent)
        self.login(client, 'std-1')
        lesson = self.create(client)
        self.assertEqual(lesson['result']['provider'], 'original')
        self.assertIsNone(lesson['profile']['level'])
        base = '/api/student-materials/'+lesson['id']
        client.post(base+'/complete')
        self.assertEqual(client.post(base+'/quiz', json={'opt_in': True}).status_code, 409)
        self.assertEqual(calls, [])

    def test_solar_receives_profile_rules_real_material_and_quiz_request_is_idempotent(self):
        requests = []
        def handler(request):
            payload = json.loads(request.content)
            data = json.loads(payload['messages'][1]['content'])
            requests.append(data)
            if 'lesson_material' in data:
                output = demo_assessment(data['lesson_material'])
            else:
                output = demo_material(data)
                output['vocabulary'] = [{'term': '원고', 'tier': '3', 'translation': '原告', 'simple_meaning': '소송을 제기한 사람', 'action': 'elaborate'}]
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(output)}}]})
        client = self.client(SolarLearningAgent(transport=httpx.MockTransport(handler)))
        self.login(client)
        lesson = self.create(client)
        self.assertEqual(lesson['result']['vocabulary'][0]['translation'], '原告')
        self.assertEqual(requests[0]['learner_profile']['native_language'], '중국어')
        self.assertEqual(requests[0]['learner_profile']['overall_korean_level'], 5)
        self.assertIn('layers', requests[0]['learner_profile']['diagnostic_evidence'])
        self.assertIn('reconstruction_rules', requests[0])
        self.assertNotIn('display_name', requests[0]['learner_profile'])
        base = '/api/student-materials/'+lesson['id']
        client.post(base+'/complete')
        self.assertEqual(client.post(base+'/quiz', json={'opt_in':True}).status_code, 201)
        self.assertEqual(client.post(base+'/quiz', json={'opt_in':True}).status_code, 201)
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[1]['lesson_material'], lesson['result'])
        self.assertTrue(requests[1]['learning_completed'])
        self.assertTrue(requests[1]['learner_opted_in'])
        self.assertIn('item_review_criteria', requests[1]['fairness_rules'])
        with connect(self.path) as db:
            db.execute("UPDATE students SET language='und' WHERE id='std-example-a'")
        unknown = self.create(client)
        self.assertEqual(unknown['result']['vocabulary'][0]['translation'], '')

    def test_stale_diagnosis_blocks_quiz(self):
        client = self.client()
        self.login(client)
        base = '/api/student-materials/'+self.create(client)['id']
        client.post(base+'/complete')
        with connect(self.path) as db:
            db.execute("UPDATE students SET diagnostic_summary=NULL WHERE id='std-example-a'")
        self.assertEqual(client.post(base+'/quiz', json={'opt_in':True}).status_code, 409)

    def test_optional_unit_persists_and_existing_database_is_migrated(self):
        client = self.client()
        self.login(client)
        old_lesson = self.create(client)
        # Simulate the previous released schema in this isolated test database.
        with connect(self.path) as db:
            db.execute("ALTER TABLE student_materials DROP COLUMN unit")
        reopened = self.client()
        self.login(reopened)
        migrated = reopened.get('/api/student-materials/'+old_lesson['id']).json()
        self.assertEqual(migrated['unit'], '')
        self.assertEqual(migrated['result'], old_lesson['result'])
        self.assertEqual(migrated['source_text'], SOURCE)
        created = reopened.post('/api/student-materials', json=dict(INPUT, unit='  민사 재판의 이해  '))
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()['unit'], '민사 재판의 이해')
        final_client = self.client()
        self.login(final_client)
        self.assertEqual(final_client.get('/api/student-materials/'+created.json()['id']).json()['unit'], '민사 재판의 이해')
        self.assertEqual(final_client.post('/api/student-materials', json=dict(INPUT, unit='가' * 101)).status_code, 422)

    def test_pdf_rejections_and_valid_text_pdf(self):
        client = self.client()
        self.login(client)
        endpoint = '/api/student-materials/extract'
        self.assertEqual(client.post(endpoint, files={'file': ('bad.pdf', b'not a pdf', 'application/pdf')}).status_code, 415)
        self.assertEqual(client.post(endpoint, files={'file': ('bad.pdf', b'%PDF-invalid', 'application/pdf')}).status_code, 422)
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, NameObject, DictionaryObject
        import io
        writer = PdfWriter()
        page = writer.add_blank_page(width=600, height=800)
        font = DictionaryObject({NameObject('/Type'):NameObject('/Font'), NameObject('/Subtype'):NameObject('/Type1'), NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
        stream = DecodedStreamObject()
        stream.set_data(b'BT /F1 12 Tf 50 700 Td (This is a lesson about civil trials.) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(stream)
        buffer = io.BytesIO(); writer.write(buffer)
        response = client.post(endpoint, files={'file': ('lesson.pdf', buffer.getvalue(), 'application/pdf')})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('civil trials', response.json()['text'])

    def test_invalid_model_output_is_not_saved_and_errors_do_not_leak(self):
        for response in [httpx.Response(401, text='PRIVATE TOKEN'), httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'{}'}}]})]:
            agent = SolarLearningAgent(transport=httpx.MockTransport(lambda r: response))
            client = self.client(agent); self.login(client)
            result = client.post('/api/student-materials', json=INPUT)
            self.assertGreaterEqual(result.status_code, 400)
            self.assertNotIn('PRIVATE TOKEN', result.text)
            self.assertEqual(client.get('/api/student-materials').json(), [])

    def test_fairness_source_validation_and_all_three_question_types(self):
        from app.student_l1.workflow import score, public_quiz
        material = {'sentences':[{'id':'s1','source':SOURCE,'rewritten':SOURCE}]}
        quiz = demo_assessment(material)
        question = quiz['items'][0]
        mc = dict(question, id='q2', type='multiple_choice_4', choices=['원고','피고','판사','증인'], correct_answer='원고')
        short = dict(question, id='q3', type='short_answer', choices=[], correct_answer='원고', accepted_answers=['소송을 제기한 사람'])
        quiz['items'].extend([mc, short])
        checked = normalize_assessment(quiz, material)
        self.assertEqual(score(checked, {'q1':'O','q2':'원고','q3':' 소송을  제기한 사람 '})['score'], 3)
        self.assertNotIn('correct_answer', json.dumps(public_quiz(checked)))
        bad = copy.deepcopy(quiz); bad['items'][0]['review']['level_fit'] = False
        with self.assertRaises(ValueError): normalize_assessment(bad, material)
        bad = copy.deepcopy(quiz); bad['items'][0]['source_sentence_ids'] = ['fake']
        with self.assertRaises(ValueError): normalize_assessment(bad, material)


if __name__ == '__main__':
    unittest.main()
