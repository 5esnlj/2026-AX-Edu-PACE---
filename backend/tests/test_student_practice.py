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
from app.database import connect, initialize
from app.main import create_app
from app.solar_agent import SolarLearningAgent
from app.student_practice.workflow import demo_generate

SOURCE = '민사 재판은 개인 사이의 분쟁을 해결하는 재판입니다. 원고는 소송을 제기한 사람입니다. 피고는 소송을 당한 사람입니다.'
INPUT = {'source_kind':'text', 'title':'민사 재판', 'source_text':SOURCE, 'question_type':'true_false', 'learning_completed':True, 'opt_in':True}


class StudentPracticeTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict(os.environ, {'IEUM_AGENT_PROVIDER':'demo', 'IEUM_DEMO_ENABLED':'true', 'UPSTAGE_API_KEY':'test-not-real'})
        patcher.start(); self.addCleanup(patcher.stop)
        self.folder = tempfile.TemporaryDirectory(); self.addCleanup(self.folder.cleanup)
        self.path = str(Path(self.folder.name) / 'test.db')

    def client(self, agent=None):
        client = TestClient(create_app(self.path, agent or DemoLearningAgent()))
        client.__enter__(); self.addCleanup(client.__exit__, None, None, None)
        return client

    def login(self, client, sid='std-1', role='student'):
        self.assertEqual(client.post('/api/demo/session', json={'role':role,'student_id':sid}).status_code, 200)

    def create(self, client, **overrides):
        response = client.post('/api/student-practice', json=dict(INPUT, **overrides))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_unassessed_students_can_generate_both_types_and_keep_private_saved_results(self):
        client = self.client(); self.login(client)
        for kind in ['true_false','multiple_choice_4']:
            result = self.create(client, question_type=kind)
            self.assertEqual(result['provider'], 'demo')
            self.assertIsNone(result['attempt'])
            for item in result['quiz']['items']:
                self.assertEqual(item['type'], kind)
                self.assertEqual(len(set(item['choices'])), 2 if kind == 'true_false' else 4)
                for hidden in ['correct_answer','explanation','source_sentence_ids']:
                    self.assertNotIn(hidden, item)
            self.assertNotIn('source_snapshot', result)
            qid = result['id']
            answers = {q['id']:q['choices'][0] for q in result['quiz']['items']}
            submitted = client.post(f'/api/student-practice/{qid}/submit', json={'answers':answers})
            self.assertEqual(submitted.status_code, 200, submitted.text)
            self.assertEqual(submitted.json()['total'], len(result['quiz']['items']))
            self.assertIn('correct_answer', submitted.json()['results'][0])
            initialize(self.path)
            self.assertEqual(client.get(f'/api/student-practice/{qid}').json()['attempt'], submitted.json())
            # Duplicate submission cannot rewrite the first recorded result.
            self.assertEqual(client.post(f'/api/student-practice/{qid}/submit', json={'answers':answers}).json(), submitted.json())
        self.assertEqual(len(client.get('/api/student-practice').json()), 2)
        self.assertIsNone(client.get('/api/session').json()['student']['diagnostic_summary'])
        self.login(client, 'std-2')
        self.assertEqual(client.get('/api/student-practice').json(), [])
        self.assertEqual(client.get(f'/api/student-practice/{qid}').status_code, 404)
        self.assertEqual(client.post(f'/api/student-practice/{qid}/submit', json={'answers':answers}).status_code, 404)

    def test_assigned_and_owned_sources_work_without_diagnosis_or_old_fingerprint(self):
        client = self.client(); self.login(client)
        assigned = self.create(client, source_kind='material', source_id='lesson-demo', source_text='')
        self.assertEqual(assigned['source_id'], 'lesson-demo')
        private = client.post('/api/student-materials', json={'title':'내 자료','subject':'사회','source_text':SOURCE}).json()
        with connect(self.path) as db:
            db.execute("UPDATE student_materials SET fingerprint='old-language-profile' WHERE id=?", (private['id'],))
        created = self.create(client, source_kind='student_material', source_id=private['id'], source_text='', question_type='multiple_choice_4')
        self.assertEqual(created['title'], '내 자료')
        self.login(client, 'std-2')
        self.assertEqual(client.post('/api/student-practice', json=dict(INPUT,source_kind='student_material',source_id=private['id'],source_text='')).status_code, 404)
        self.login(client, 'std-example-a')  # Not a recipient of lesson-demo.
        self.assertEqual(client.post('/api/student-practice', json=dict(INPUT,source_kind='material',source_id='lesson-demo',source_text='')).status_code, 404)

    def test_roles_confirmation_input_validation_and_bad_answers(self):
        client = self.client()
        self.assertEqual(client.get('/api/student-practice').status_code, 401)
        self.login(client, role='teacher')
        self.assertEqual(client.post('/api/student-practice',json=INPUT).status_code, 403)
        self.login(client)
        for changes, status in [({'opt_in':False},409), ({'learning_completed':False},409), ({'opt_in':'true'},422),
                                ({'question_type':'short_answer'},422), ({'source_kind':'material','source_id':'lesson-demo'},422),
                                ({'source_text':' '},422), ({'student_id':'std-2'},422)]:
            self.assertEqual(client.post('/api/student-practice',json=dict(INPUT,**changes)).status_code,status)
        result = self.create(client)
        qid = result['id']
        self.assertEqual(client.post(f'/api/student-practice/{qid}/submit',json={'answers':{'wrong':'O'}}).status_code,422)
        self.assertEqual(client.post(f'/api/student-practice/{qid}/submit',json={'answers':{q['id']:'INVALID' for q in result['quiz']['items']}}).status_code,422)
        self.assertIsNone(client.get(f'/api/student-practice/{qid}').json()['attempt'])

    def test_solar_receives_source_selected_type_and_optional_current_profile(self):
        requests = []
        def handler(request):
            body = json.loads(request.content); data = json.loads(body['messages'][1]['content']); requests.append(data)
            output = demo_generate(data)
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(output)}}]})
        client = self.client(SolarLearningAgent(transport=httpx.MockTransport(handler))); self.login(client)
        first = self.create(client,question_type='multiple_choice_4')
        self.assertEqual(first['provider'],'solar')
        self.assertIsNone(requests[0]['learner_profile']['diagnosis'])
        self.assertEqual(requests[0]['question_type'],'multiple_choice_4')
        self.assertIn('민사 재판', requests[0]['source_sentences'][0]['source'])
        self.assertNotIn('student_id',json.dumps(requests))
        self.assertNotIn('display_name',json.dumps(requests))
        self.login(client,'std-example-a')
        second = self.create(client)
        self.assertEqual(requests[1]['learner_profile']['native_language'],'중국어')
        self.assertEqual(requests[1]['learner_profile']['diagnosis']['overall'],5)
        self.assertNotEqual(first['id'], second['id'])

    def test_invalid_model_formats_or_failures_never_save_a_fake_success(self):
        for mode in ['wrong_type','wrong_evidence','repeated_choices','upstream_error']:
            def handler(request):
                if mode == 'upstream_error': return httpx.Response(401,text='private-key-do-not-echo')
                data = json.loads(json.loads(request.content)['messages'][1]['content'])
                output = demo_generate(data)
                if mode == 'wrong_type': output = demo_generate(dict(data,question_type='true_false'))
                elif mode == 'wrong_evidence': output['items'][0]['source_sentence_ids']=['missing']
                else: output['items'][0]['choices']=['same']*4
                return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(output)}}]})
            client = self.client(SolarLearningAgent(transport=httpx.MockTransport(handler))); self.login(client)
            response = client.post('/api/student-practice',json=dict(INPUT,question_type='multiple_choice_4'))
            self.assertGreaterEqual(response.status_code,400, response.text)
            self.assertNotIn('private-key-do-not-echo',response.text)
            self.assertEqual(client.get('/api/student-practice').json(),[])


if __name__ == '__main__':
    unittest.main()
