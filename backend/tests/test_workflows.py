import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from app.main import create_app
from app.agents import SAMPLE_TEXT


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / 'test.db')
        self.client = TestClient(create_app(self.path))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def login(self, role='teacher', sid='std-1'):
        response = self.client.post('/api/demo/session', json={'role': role, 'student_id': sid})
        self.assertEqual(response.status_code, 200, response.text)

    def create_material(self, targets=None, source=SAMPLE_TEXT):
        response = self.client.post('/api/materials', json={'title': '수업 검증 자료', 'subject': '사회', 'unit': '정치', 'source_text': source, 'targets': targets or ['std-1', 'std-2'], 'modes': ['easy', 'bilingual', 'visual']})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def review_all(self, item):
        for sid in item['targets']:
            response = self.client.patch(f"/api/materials/{item['id']}/review", json={'student_id': sid, 'text': item['variants'][sid]['text'], 'confirmed': True})
            self.assertEqual(response.status_code, 200, response.text)

    def test_auth_role_isolation_and_cross_origin_protection(self):
        self.assertEqual(self.client.get('/api/students').status_code, 401)
        self.login('student')
        for path in ['/api/students', '/api/reports']:
            self.assertEqual(self.client.get(path).status_code, 403)
        self.assertEqual(self.client.post('/api/invitations').status_code, 403)
        self.assertEqual(self.client.post('/api/messages', headers={'Origin': 'https://other.example'}, json={'student_id': 'std-1', 'content': 'hello'}).status_code, 403)
        self.client.delete('/api/session')
        self.assertEqual(self.client.get('/api/session').status_code, 401)

    def test_personalized_review_publish_and_recipient_visibility(self):
        self.login()
        item = self.create_material()
        mid = item['id']
        self.assertEqual(item['variants']['std-1']['language'], 'vi')
        self.assertEqual(item['variants']['std-2']['language'], 'uz')
        self.assertEqual(self.client.post(f'/api/materials/{mid}/publish').status_code, 409)
        self.login('student')
        self.assertEqual(self.client.get(f'/api/materials/{mid}').status_code, 404)
        self.login()
        sid = 'std-1'
        corrected = self.client.patch(f'/api/materials/{mid}/review', json={'student_id': sid, 'text': item['variants'][sid]['text'], 'translations': {'민주주의': '교사 검토 번역'}, 'confirmed': True})
        self.assertEqual(corrected.status_code, 200)
        self.assertEqual(self.client.post(f'/api/materials/{mid}/publish').status_code, 409)
        self.client.patch(f'/api/materials/{mid}/review', json={'student_id': 'std-2', 'text': item['variants']['std-2']['text'], 'confirmed': True})
        self.assertEqual(self.client.post(f'/api/materials/{mid}/publish').status_code, 200)
        self.login('student')
        visible = self.client.get(f'/api/materials/{mid}').json()
        self.assertEqual(set(visible['variants']), {'std-1'})
        self.assertEqual(visible['variants']['std-1']['terms'][0]['translation'], '교사 검토 번역')
        self.login('student', 'std-3')
        self.assertEqual(self.client.get(f'/api/materials/{mid}').status_code, 404)
        self.assertNotIn(mid, [m['id'] for m in self.client.get('/api/materials').json()])
        self.login()
        self.assertEqual(self.client.patch(f'/api/materials/{mid}/review', json={'student_id': sid, 'text': '배포된 자료를 마음대로 바꾸면 안 됩니다.', 'confirmed': True}).status_code, 409)

    def test_assessment_answer_secrecy_validation_and_report_evidence(self):
        self.login('student')
        quiz = self.client.get('/api/quizzes/quiz-demo').json()
        for question in quiz['questions']:
            self.assertNotIn('answer', question)
            self.assertNotIn('explanation', question)
        self.assertEqual(self.client.post('/api/quizzes/quiz-demo/submit', json={'answers': {'q1': 0}}).status_code, 422)
        self.assertEqual(self.client.post('/api/quizzes/quiz-demo/submit', json={'answers': {'q1': True, 'q2': 1, 'q3': 2, 'q4': 0}}).status_code, 422)
        result = self.client.post('/api/quizzes/quiz-demo/submit', json={'answers': {'q1': 1, 'q2': 1, 'q3': 0, 'q4': 0}})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['kind'], 'language')
        self.assertEqual(result.json()['score'], 2)
        self.assertIn('answer', result.json()['results'][0])
        self.login()
        report = next(r for r in self.client.get('/api/reports').json() if r['student']['id'] == 'std-1')
        self.assertEqual(report['attempt']['kind'], 'language')
        self.assertFalse(report['attempt']['is_sample'])
        untouched = next(r for r in self.client.get('/api/reports').json() if r['student']['id'] == 'std-5')
        self.assertIsNone(untouched['attempt'])

    def test_quiz_generation_rejects_unreviewed_and_unsupported_sources(self):
        self.login()
        item = self.create_material(['std-1'])
        self.assertEqual(self.client.post(f"/api/materials/{item['id']}/quiz").status_code, 409)
        self.review_all(item)
        self.client.post(f"/api/materials/{item['id']}/publish")
        qid = self.client.post(f"/api/materials/{item['id']}/quiz").json()['id']
        self.assertEqual(self.client.post(f"/api/materials/{item['id']}/quiz").json()['id'], qid)
        self.login('student', 'std-3')
        self.assertEqual(self.client.get(f'/api/quizzes/{qid}').status_code, 404)
        self.login()
        arbitrary = self.create_material(['std-1'], source='민주주의와 시민 그리고 투표라는 단어가 있지만, 학습 자료의 내용을 확인할 수 없습니다.')
        self.review_all(arbitrary)
        self.client.post(f"/api/materials/{arbitrary['id']}/publish")
        self.assertEqual(self.client.post(f"/api/materials/{arbitrary['id']}/quiz").status_code, 422)

    def test_learning_storage_self_check_and_roadmap(self):
        self.login('student')
        data = {'notes': '권리와 의무를 다시 읽어 보기', 'known': ['민주주의'], 'unknown': ['의무']}
        self.assertEqual(self.client.put('/api/learning/lesson-demo', json=data).status_code, 200)
        self.assertEqual(self.client.get('/api/learning/lesson-demo').json(), data)
        invalid = dict(data, unknown=['민주주의'])
        self.assertEqual(self.client.put('/api/learning/lesson-demo', json=invalid).status_code, 422)
        before = self.client.get('/api/roadmap').json()
        self.assertNotIn('answer', before['steps'][0])
        self.client.post('/api/roadmap/words/complete', json={'answer': 1})
        self.assertFalse(self.client.get('/api/roadmap').json()['steps'][0]['completed'])
        self.client.post('/api/roadmap/words/complete', json={'answer': 0})
        self.client.post('/api/roadmap/words/complete', json={'answer': 0})
        self.assertTrue(self.client.get('/api/roadmap').json()['steps'][0]['completed'])
        self.assertEqual(self.client.post('/api/diagnostic', json={'listening': 5, 'speaking': 3, 'reading': 3, 'writing': 3, 'everyday': 4}).status_code, 422)
        self.client.post('/api/diagnostic', json={'listening': 3, 'speaking': 3, 'reading': 3, 'writing': 3, 'everyday': 4})
        self.assertEqual(self.client.get('/api/roadmap').json()['recommended'], 'concepts')
        self.assertEqual(self.client.get('/api/session').json()['student']['diagnostic_source'], 'self')

    def test_glossary_unknown_language_and_message_scope(self):
        self.login()
        result = self.client.post('/api/glossary/check', json={'language': 'en', 'entries': [{'term': '민주주의', 'candidate': 'monarchy'}, {'term': '민주주의', 'candidate': 'democracy'}, {'term': '미등록', 'candidate': 'unknown'}]}).json()
        self.assertEqual([r['status'] for r in result], ['review', 'match', 'unknown'])
        self.login('student')
        self.client.post('/api/messages', json={'student_id': 'std-2', 'content': '나의 메시지'})
        own = self.client.get('/api/messages?student_id=std-2').json()
        self.assertEqual(own[-1]['student_id'], 'std-1')
        self.login('student', 'std-2')
        self.assertNotIn('나의 메시지', [m['content'] for m in self.client.get('/api/messages?student_id=std-1').json()])

    def test_pdf_extraction_rejects_invalid_and_scanned_pdf(self):
        self.login()
        self.assertEqual(self.client.post('/api/extract', files={'file': ('wrong.pdf', b'not a pdf', 'application/pdf')}).status_code, 415)
        writer = PdfWriter()
        page = writer.add_blank_page(width=400, height=400)
        out = io.BytesIO(); writer.write(out)
        self.assertEqual(self.client.post('/api/extract', files={'file': ('scanned.pdf', out.getvalue(), 'application/pdf')}).status_code, 422)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 20 200 Td (Democracy lets people participate together.) Tj ET')
        page[NameObject('/Contents')] = stream
        out = io.BytesIO(); writer.write(out)
        response = self.client.post('/api/extract', files={'file': ('text.pdf', out.getvalue(), 'application/pdf')})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('Democracy', response.json()['text'])

    def test_data_survives_app_restart_and_demo_can_be_disabled(self):
        self.login('student')
        self.client.post('/api/messages', json={'student_id': 'std-1', 'content': '재시작 이후에도 남아요'})
        with TestClient(create_app(self.path)) as second:
            second.post('/api/demo/session', json={'role': 'student', 'student_id': 'std-1'})
            self.assertEqual(second.get('/api/messages').json()[-1]['content'], '재시작 이후에도 남아요')
        with patch.dict(os.environ, {'IEUM_DEMO_ENABLED': 'false'}):
            with TestClient(create_app(self.path)) as disabled:
                self.assertEqual(disabled.post('/api/demo/session', json={'role': 'teacher'}).status_code, 403)
                self.assertEqual(disabled.get('/api/demo').status_code, 404)


if __name__ == '__main__':
    unittest.main()
