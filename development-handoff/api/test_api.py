"""HTTP contract/business tests for the isolated 가나다계단 mock.

Run: python -m unittest -v test_api
No production DB, Solar requests, or external user data is used.
"""
from __future__ import annotations

import copy
import re
import unittest

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

import mock_server

BASE = "/api/v1"
PASSWORD = "mock-pass-123"


class ApiContractTests(unittest.TestCase):
    def setUp(self):
        mock_server.reset_state()
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            client.close()

    def client(self):
        client = TestClient(mock_server.app)
        self.clients.append(client)
        return client

    def login(self, login_id="t_math", role=None):
        client = self.client()
        role = role or ("teacher" if login_id.startswith("t_") else "student")
        response = client.post(BASE + "/auth/login", json={
            "loginId": login_id, "password": PASSWORD, "role": role,
        })
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertIsInstance(data["csrfToken"], str)
        client.headers["X-CSRF-Token"] = data["csrfToken"]
        return client, data

    def request(self, client, method, path, expected=200, **kwargs):
        response = client.request(method, BASE + path, **kwargs)
        self.assertEqual(response.status_code, expected, response.text)
        if expected != 204 and "application/json" in response.headers.get("content-type", ""):
            self.validate_schema(method, path, expected, response.json())
        return response

    def validate_schema(self, method, path, status, payload):
        document = mock_server.app.openapi()
        resource = BASE + path.split("?", 1)[0]
        matched = next((item for template, item in document["paths"].items()
                        if re.fullmatch(re.sub(r"\{[^}]+\}", "[^/]+", template), resource)), None)
        self.assertIsNotNone(matched, resource)
        response = matched[method.lower()]["responses"][str(status)]
        schema = response.get("content", {}).get("application/json", {}).get("schema", {})
        if schema:
            validation_schema = copy.deepcopy(schema)
            validation_schema["components"] = document["components"]
            errors = list(Draft202012Validator(validation_schema).iter_errors(payload))
            self.assertEqual(errors, [], "\n".join(str(e) for e in errors))

    def items(self, client, path):
        body = self.request(client, "GET", path).json()
        self.assertIsInstance(body["items"], list)
        self.assertIn("nextCursor", body)
        return body["items"]

    def assert_error(self, response, *statuses):
        self.assertIn(response.status_code, statuses, response.text)
        payload = response.json()
        self.assertTrue({"code", "message", "requestId", "details"} <= payload.keys(), payload)
        return payload

    def test_login_requires_actual_role_and_valid_password(self):
        client = self.client()
        self.assert_error(client.post(BASE + "/auth/login", json={
            "loginId": "t_math", "password": "incorrect", "role": "teacher",
        }), 401)
        self.assert_error(client.post(BASE + "/auth/login", json={
            "loginId": "s_a", "password": PASSWORD, "role": "teacher",
        }), 401, 403)
        self.assert_error(client.get(BASE + "/classes"), 401)

    def test_session_csrf_and_logout(self):
        client, login = self.login()
        self.request(client, "GET", "/auth/me")
        csrf = client.headers.pop("X-CSRF-Token")
        self.assert_error(client.post(BASE + "/auth/logout"), 403)
        client.headers["X-CSRF-Token"] = csrf
        self.request(client, "POST", "/auth/logout", expected=204)
        self.assert_error(client.get(BASE + "/auth/me"), 401)

    def test_health_has_no_credentials(self):
        response = self.request(self.client(), "GET", "/health")
        text = response.text.lower()
        self.assertNotIn("encryptedsecret", text)
        self.assertNotIn("api_key", text)
        self.assertNotIn(PASSWORD, text)

    def test_openapi_is_available_and_declares_core_routes(self):
        document = self.client().get("/openapi.json")
        self.assertEqual(document.status_code, 200)
        schema = document.json()
        self.assertTrue(schema["openapi"].startswith("3."))
        for path in ("/auth/login", "/auth/me", "/classes", "/diagnostic/answers", "/diagnostic/results"):
            self.assertIn(BASE + path, schema["paths"])
        self.assertNotIn("/api/v1/vocabulary", schema["paths"])
        self.assertNotIn("/api/v1/messages", schema["paths"])

    def test_teacher_class_and_subject_scoping_in_lists_and_direct_ids(self):
        math, _ = self.login("t_math")
        science, _ = self.login("t_science")
        outside, _ = self.login("t_outside")
        self.assertEqual({x["id"] for x in self.items(math, "/classes")}, {"cls_1"})
        self.assertEqual({x["id"] for x in self.items(outside, "/classes")}, {"cls_2"})
        for client, subject in ((math, "math"), (science, "science")):
            for suffix in ("sources", "materials", "quizzes"):
                values = self.items(client, f"/classes/cls_1/{suffix}")
                self.assertTrue(values)
                self.assertEqual({x["subject"] for x in values}, {subject})
        for path in ("/sources/src_science_1", "/materials/mat_a_science_1",
                     "/quizzes/quiz_a_science_1", "/files/file_src_science_1/download"):
            self.assert_error(math.get(BASE + path), 403, 404)
        for path in ("/classes/cls_2/sources", "/classes/cls_2/students",
                     "/sources/src_outside_1", "/quizzes/quiz_outside_1"):
            self.assert_error(math.get(BASE + path), 403, 404)
        self.assert_error(outside.get(BASE + "/classes/cls_1/dashboard"), 403, 404)

    def test_student_only_receives_own_published_resources(self):
        student, _ = self.login("s_a")
        materials = self.items(student, "/classes/cls_1/materials")
        quizzes = self.items(student, "/classes/cls_1/quizzes")
        self.assertEqual({x["id"] for x in materials}, {"mat_a_math_1", "mat_a_science_1"})
        self.assertEqual({x["id"] for x in quizzes}, {"quiz_a_math_1", "quiz_a_science_1"})
        for path in ("/materials/mat_b_math_1", "/quizzes/quiz_b_math_1", "/quizzes/quiz_outside_1"):
            self.assert_error(student.get(BASE + path), 403, 404)
        b, _ = self.login("s_b")
        self.assertEqual(self.items(b, "/classes/cls_1/materials"), [])
        self.assertEqual(self.items(b, "/classes/cls_1/quizzes"), [])
        self.assert_error(b.get(BASE + "/materials/mat_a_math_1"), 403, 404)

    def test_incomplete_diagnostic_blocks_learning(self):
        student, _ = self.login("s_pending")
        self.request(student, "GET", "/diagnostic")
        self.request(student, "GET", "/classes")
        for path in ("/classes/cls_1/materials", "/classes/cls_1/quizzes", "/quizzes/quiz_a_math_1"):
            self.assert_error(student.get(BASE + path), 403, 409)

    def test_student_question_payload_never_leaks_answer_key(self):
        student, _ = self.login("s_a")
        body = self.request(student, "GET", "/quizzes/quiz_a_math_1").json()
        self.assertIn("questions", body)
        self.assertTrue(body["questions"])
        for question in body["questions"]:
            self.assertNotIn("correctOptionId", question)
            self.assertNotIn("explanation", question)
            self.assertEqual(len(question["choices"]), 4)
        teacher, _ = self.login("t_math")
        review = self.request(teacher, "GET", "/quizzes/quiz_a_math_1").json()
        self.assertIn("correctOptionId", review["questions"][0])

    def etag(self, client, path):
        result = self.request(client, "GET", path)
        return result.headers.get("ETag", '"' + str(result.json()["version"]) + '"')

    def test_material_optimistic_concurrency_review_reset_and_publish(self):
        teacher, _ = self.login()
        path = "/materials/mat_b_math_1"
        content = {"paragraphs": [{"id": "s1", "text": "검토 후 수정된 가상 본문"}], "translations": []}
        self.assert_error(teacher.patch(BASE + path, json={"content": content}), 428)
        current = self.etag(teacher, path)
        self.assert_error(teacher.post(BASE + path + "/publish", headers={"If-Match": current}), 409)
        reviewed = self.request(teacher, "POST", path + "/review", headers={"If-Match": current}).json()
        self.assertEqual(reviewed["status"], "reviewed")
        self.assert_error(teacher.patch(BASE + path, json={"content": content}, headers={"If-Match": current}), 412)
        edited = self.request(teacher, "PATCH", path, json={"content": content}, headers={"If-Match": self.etag(teacher, path)}).json()
        self.assertEqual(edited["status"], "draft")
        self.assertIsNone(edited.get("reviewedAt"))
        self.request(teacher, "POST", path + "/review", headers={"If-Match": self.etag(teacher, path)})
        published = self.request(teacher, "POST", path + "/publish", headers={"If-Match": self.etag(teacher, path)}).json()
        self.assertEqual(published["status"], "published")
        self.assert_error(teacher.patch(BASE + path, json={"content": content}, headers={"If-Match": self.etag(teacher, path)}), 409)
        student, _ = self.login("s_b")
        self.assertEqual(self.request(student, "GET", path).json()["content"], content)

    def test_teacher_cannot_edit_other_subject_even_as_class_owner(self):
        teacher, _ = self.login()
        self.assert_error(teacher.post(BASE + "/quizzes/quiz_a_science_1/review", headers={"If-Match": '"1"'}), 403, 404)
        self.assert_error(teacher.post(BASE + "/materials/mat_a_science_1/publish", headers={"If-Match": '"1"'}), 403, 404)

    def test_generation_rejects_student_caller(self):
        student, _ = self.login("s_a")
        body = {"sourceId": "src_math_1", "studentMemberIds": ["mem_s_a"], "operation": "convert"}
        self.assert_error(student.post(BASE + "/classes/cls_1/generation-jobs", json=body, headers={"Idempotency-Key": "student-create"}), 403)

    def test_class_creation_is_teacher_only_and_creates_membership(self):
        teacher, _ = self.login()
        body = {"name": "테스트 신규 반", "teacherSubject": "daily", "gradeLabel": "중1", "academicYear": 2026}
        created = self.request(teacher, "POST", "/classes", expected=201, json=body).json()
        self.assertEqual(created["teacherSubject"], "daily")
        self.assertIn(created["id"], [c["id"] for c in self.items(teacher, "/classes")])
        student, _ = self.login("s_a")
        self.assert_error(student.post(BASE + "/classes", json=body), 403)

    def test_invitation_role_subject_capacity_and_replay(self):
        owner, _ = self.login()
        teacher, _ = self.login("t_science")
        new_student, state = self.login("s_new")
        self.assertEqual(state["nextAction"], "join_class")
        self.assert_error(teacher.post(BASE + "/classes/cls_1/invitations", json={"invitedRole": "teacher", "teacherSubject": "science"}), 403)
        self.assert_error(owner.post(BASE + "/classes/cls_1/invitations", json={"invitedRole": "teacher"}), 422)
        self.assert_error(owner.post(BASE + "/classes/cls_1/invitations", json={"invitedRole": "student", "teacherSubject": "math"}), 422)
        invitation = self.request(owner, "POST", "/classes/cls_1/invitations", expected=201,
                                  json={"invitedRole": "student", "maxUses": 1}).json()
        self.assert_error(teacher.post(BASE + "/invitations/accept", json={"code": invitation["code"]}), 403)
        joined = self.request(new_student, "POST", "/invitations/accept", json={"code": invitation["code"]}).json()
        self.assertEqual(joined["membership"]["classId"], "cls_1")
        self.assertEqual(joined["nextAction"], "diagnostic")
        replay = self.request(new_student, "POST", "/invitations/accept", json={"code": invitation["code"]}).json()
        self.assertTrue(replay["alreadyMember"])
        # A second synthetic student not yet in this class cannot consume the exhausted invitation.
        outside_student, _ = self.login("s_outside")
        self.assert_error(outside_student.post(BASE + "/invitations/accept", json={"code": invitation["code"]}), 409)
        teacher_invite = self.request(owner, "POST", "/classes/cls_1/invitations", expected=201,
                                     json={"invitedRole": "teacher", "teacherSubject": "science"}).json()
        outside_teacher, _ = self.login("t_outside")
        added = self.request(outside_teacher, "POST", "/invitations/accept", json={"code": teacher_invite["code"]}).json()
        self.assertEqual(added["membership"]["teacherSubject"], "science")
        self.assertEqual({x["subject"] for x in self.items(outside_teacher, "/classes/cls_1/sources")}, {"science"})
        mock_server.STATE["invitations"][invitation["code"]]["expiresAt"] = "2000-01-01T00:00:00+00:00"
        self.assert_error(new_student.post(BASE + "/invitations/accept", json={"code": invitation["code"]}), 404)

    def test_diagnostic_requires_join_then_resumes_and_rejects_answer_changes(self):
        unjoined, _ = self.login("s_new")
        self.assert_error(unjoined.post(BASE + "/diagnostic/start", json={"classId": "cls_1"}), 403, 404)
        student, _ = self.login("s_pending")
        before = self.request(student, "GET", "/diagnostic/next-question").json()
        self.assertEqual(before["progress"]["totalQuestions"], 70)
        self.assertEqual(before["question"]["id"], "dq_001")
        self.assertNotIn("correctOptionId", before["question"])
        self.assert_error(student.post(BASE + "/diagnostic/answers", json={"questionId": "dq_002", "selectedOptionId": "1"}), 409)
        self.assert_error(student.post(BASE + "/diagnostic/answers", json={"questionId": "dq_001", "selectedOptionId": "invalid"}), 422)
        saved = self.request(student, "POST", "/diagnostic/answers", json={"questionId": "dq_001", "selectedOptionId": None}).json()
        self.assertEqual(saved["progress"]["completedQuestions"], 1)
        replay = self.request(student, "POST", "/diagnostic/answers", json={"questionId": "dq_001", "selectedOptionId": None}).json()
        self.assertTrue(replay["replayed"])
        self.assert_error(student.post(BASE + "/diagnostic/answers", json={"questionId": "dq_001", "selectedOptionId": "1"}), 409)
        self.request(student, "POST", "/auth/logout", expected=204)
        again, _ = self.login("s_pending")
        resumed = self.request(again, "GET", "/diagnostic/next-question").json()
        self.assertEqual(resumed["question"]["id"], "dq_002")
        self.assertEqual(resumed["progress"]["completedQuestions"], 1)

    def test_full_diagnostic_10_parts_5_areas_score_gates_and_once_only(self):
        student, _ = self.login("s_pending")
        # Synthetic fixture weights5,5,15,15,15,15,30; first6 are 2 gates per tier.
        patterns = [
            [0,0,0,0,0,0,0], [1,1,1,1,1,1,1],
            [1,0,0,0,0,0,1], [1,1,1,1,0,0,0],
            [1,1,1,1,1,1,0], [1,1,1,1,1,1,1],
            [0,0,1,1,1,1,1], [1,0,1,1,1,0,1],
            [1,0,1,0,1,1,1], [1,0,1,1,0,0,0],
        ]
        for group, answers in enumerate(patterns):
            for index, correct in enumerate(answers):
                qid = f"dq_{group * 7 + index + 1:03}"
                response = self.request(student, "POST", "/diagnostic/answers", json={"questionId": qid, "selectedOptionId": "1" if correct else "2"}).json()
        self.assertEqual(response["progress"]["status"], "completed")
        result = self.request(student, "GET", "/diagnostic/results").json()
        self.assertEqual(len(result["parts"]), 10)
        self.assertEqual(len(result["areas"]), 5)
        self.assertEqual([(p["score"], p["level"]) for p in result["parts"]], [
            (0,"below_beginner"),(100,"advanced"),(35,"beginner"),(40,"intermediate"),
            (70,"advanced"),(100,"advanced"),(90,"below_beginner"),(80,"intermediate"),
            (80,"beginner"),(35,"beginner"),
        ])
        self.assertEqual([(a["score"],a["level"]) for a in result["areas"]], [
            (100,"beginner"),(75,"beginner"),(170,"advanced"),(170,"advanced"),(115,"intermediate"),
        ])
        again = self.request(student, "POST", "/diagnostic/start", json={"classId": "cls_1"}).json()
        self.assertEqual(again["completedQuestions"], 70)
        self.assertEqual(again["status"], "completed")
        self.assertIsNone(self.request(student, "GET", "/diagnostic/next-question").json()["question"])
        self.request(student, "GET", "/classes/cls_1/materials")

    def test_generation_per_student_idempotency_and_validation(self):
        teacher, _ = self.login()
        path = "/classes/cls_1/generation-jobs"
        payload = {"sourceId": "src_math_1", "studentMemberIds": ["mem_s_a", "mem_s_b"], "operation": "convert"}
        self.assert_error(teacher.post(BASE + path, json=payload), 400)
        generated = self.request(teacher, "POST", path, expected=202, json=payload, headers={"Idempotency-Key": "convert-two"}).json()
        self.assertEqual(len(generated["items"]), 2)
        replay = self.request(teacher, "POST", path, expected=202, json=payload, headers={"Idempotency-Key": "convert-two"}).json()
        self.assertEqual(generated, replay)
        self.assert_error(teacher.post(BASE + path, json={**payload, "studentMemberIds": ["mem_s_a"]}, headers={"Idempotency-Key": "convert-two"}), 409)
        outputs = [self.request(teacher, "GET", "/generation-jobs/" + j["id"]).json() for j in generated["items"]]
        self.assertTrue(all(j["status"] == "succeeded" for j in outputs))
        self.assertEqual(len({j["resultId"] for j in outputs}), 2)
        self.assertEqual({self.request(teacher,"GET","/materials/" + j["resultId"]).json()["studentMemberId"] for j in outputs}, {"mem_s_a","mem_s_b"})
        science, _ = self.login("t_science")
        self.assert_error(science.get(BASE + "/generation-jobs/" + outputs[0]["id"]), 403, 404)
        self.assert_error(teacher.post(BASE + path, json={**payload, "studentMemberIds": ["mem_s_a", "mem_s_a"]}, headers={"Idempotency-Key": "duplicate-target"}), 422)
        self.assert_error(teacher.post(BASE + path, json={**payload, "studentMemberIds": ["mem_s_pending"]}, headers={"Idempotency-Key": "incomplete-target"}), 409)

    def test_generate_tf_and_four_choice_review_edit_publish(self):
        teacher, _ = self.login()
        for kind, number in (("true_false", 2), ("multiple_choice_4", 4)):
            with self.subTest(kind=kind):
                payload = {"sourceId": "src_math_1", "studentMemberIds": ["mem_s_a"], "operation": "generate_quiz", "questionType": kind, "questionCount": 2}
                created = self.request(teacher,"POST","/classes/cls_1/generation-jobs",expected=202,json=payload,headers={"Idempotency-Key": "generate-"+kind}).json()
                job = self.request(teacher,"GET","/generation-jobs/"+created["items"][0]["id"]).json()
                path = "/quizzes/" + job["resultId"]
                quiz = self.request(teacher,"GET",path).json()
                self.assertEqual(len(quiz["questions"]), 2)
                self.assertTrue(all(len(q["choices"]) == number for q in quiz["questions"]))
                self.request(teacher,"POST",path+"/review",headers={"If-Match": self.etag(teacher,path)})
                question = quiz["questions"][0]
                patch = {k:question[k] for k in ["prompt","choices","correctOptionId","explanation","sourceSentenceIds","maxPoints"]}
                patch["prompt"] = "검토 후 수정된 가상 문항"
                edited = self.request(teacher,"PATCH",path+"/questions/"+question["id"],json=patch,headers={"If-Match":self.etag(teacher,path)}).json()
                self.assertEqual(edited["status"], "draft")
                bad = {**patch,"correctOptionId":"unknown"}
                self.assert_error(teacher.patch(BASE+path+"/questions/"+question["id"],json=bad,headers={"If-Match":self.etag(teacher,path)}),422)
                self.request(teacher,"POST",path+"/review",headers={"If-Match":self.etag(teacher,path)})
                self.request(teacher,"POST",path+"/publish",headers={"If-Match":self.etag(teacher,path)})
                student,_=self.login("s_a")
                visible=self.request(student,"GET",path).json()
                self.assertNotIn("correctOptionId",visible["questions"][0])

    def test_answer_retries_idempotency_first_score_and_explanation(self):
        student,_=self.login("s_a")
        path="/quizzes/quiz_a_math_1"
        first_id="quiz_a_math_1_q1"
        before=self.request(student,"GET",path+"/results").json()
        self.assertIsNone(before["firstScore"])
        self.assertEqual(before["currentWrongCount"],0)
        self.assertEqual(before["unansweredQuestionCount"],3)
        self.assert_error(student.get(BASE+path+"/questions/"+first_id+"/explanation"),403)
        answer={"questionId":first_id,"selectedOptionId":"2"}
        first=self.request(student,"POST",path+"/answers",json=answer,headers={"Idempotency-Key":"a1"}).json()
        self.assertFalse(first["isCorrect"])
        self.assertEqual(first["retryCount"],0)
        replay=self.request(student,"POST",path+"/answers",json=answer,headers={"Idempotency-Key":"a1"}).json()
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["attemptNo"],1)
        self.assert_error(student.post(BASE+path+"/answers",json={**answer,"selectedOptionId":"1"},headers={"Idempotency-Key":"a1"}),409)
        self.request(student,"GET",path+"/questions/"+first_id+"/explanation")
        self.assert_error(student.post(BASE+path+"/answers",json={"questionId":"quiz_a_science_1_q1","selectedOptionId":"1"},headers={"Idempotency-Key":"mixed"}),404)
        for index in (2,3):
            self.request(student,"POST",path+"/answers",json={"questionId":f"quiz_a_math_1_q{index}","selectedOptionId":"1"},headers={"Idempotency-Key":f"a{index}"})
        complete=self.request(student,"GET",path+"/results").json()
        self.assertEqual((complete["firstScore"],complete["firstCorrectCount"],complete["status"]),(2,2,"completed"))
        retried=self.request(student,"POST",path+"/answers",json={**answer,"selectedOptionId":"1"},headers={"Idempotency-Key":"retry1"}).json()
        self.assertEqual(retried["retryCount"],1)
        self.assertEqual(retried["results"]["firstScore"],2)
        self.assertEqual(retried["results"]["latestCorrectCount"],3)
        self.assertEqual(retried["results"]["currentWrongCount"],0)
        self.assert_error(student.post(BASE+path+"/answers",json={**answer,"selectedOptionId":"1"},headers={"Idempotency-Key":"retry2"}),409)

    def test_personal_credentials_and_generation_without_own_key(self):
        teacher,_=self.login()
        credentials=self.items(teacher,"/ai-credentials")
        self.assertTrue(all(x["teacherId"]=="usr_t_math" for x in credentials))
        self.assert_error(teacher.post(BASE+"/ai-credentials/cred_t_science/check"),404)
        self.assert_error(teacher.delete(BASE+"/ai-credentials/cred_t_science"),404)
        self.assert_error(teacher.post(BASE+"/ai-credentials",json={"apiKey":"real-looking-secret"}),422)
        self.request(teacher,"DELETE","/ai-credentials/cred_t_math",expected=204)
        payload={"sourceId":"src_math_1","studentMemberIds":["mem_s_a"],"operation":"convert"}
        self.assert_error(teacher.post(BASE+"/classes/cls_1/generation-jobs",json=payload,headers={"Idempotency-Key":"no-key"}),409)
        key="mock-test-secret-5678"
        created=self.request(teacher,"POST","/ai-credentials",expected=201,json={"apiKey":key}).json()
        self.assertNotIn(key,str(created))
        self.assertEqual(created["maskedSuffix"],"5678")
        self.request(teacher,"POST","/ai-credentials/"+created["id"]+"/check")
        self.request(teacher,"POST","/classes/cls_1/generation-jobs",expected=202,json=payload,headers={"Idempotency-Key":"new-key"})

    def test_dashboards_and_level_views_use_selected_domain_and_distinct_counts(self):
        teacher,_=self.login()
        teacher_data=self.request(teacher,"GET","/classes/cls_1/dashboard").json()
        self.assertEqual(teacher_data["selectedArea"],"math")
        self.assertEqual(sum(teacher_data["levelCounts"].values()),teacher_data["studentCount"])
        self.assertIn("below_beginner",teacher_data["levelCounts"])
        self.assertEqual(teacher_data["levelCounts"]["not_diagnosed"],1)
        self.assertEqual(teacher_data["pendingReviewQuizSetCount"],1)
        levels=self.request(teacher,"GET","/classes/cls_1/students/mem_s_a/diagnostic").json()
        self.assertIn("daily",str(levels))
        self.assertTrue(self.items(teacher,"/classes/cls_1/students"))
        activity=self.items(teacher,"/classes/cls_1/activity")
        self.assertEqual({a["quizId"] for a in activity},{"quiz_a_math_1"})
        student,_=self.login("s_a")
        self.assertEqual(self.request(student,"GET","/auth/me").json()["user"]["nativeLanguage"],"zh")
        dashboard=self.request(student,"GET","/classes/cls_1/dashboard?area=daily").json()
        self.assertEqual(dashboard["selectedArea"],"daily")
        self.assertEqual(dashboard["assignedQuizSetCount"],2)
        self.assertEqual(dashboard["unansweredQuestionCount"],6)
        self.assertEqual(dashboard["retryQuestionCount"],0)
        self.assertEqual(len(dashboard["parts"]),2)
        self.assertTrue(all(p["area"]=="daily" for p in dashboard["parts"]))
        self.assertTrue(all("isRecentPublished" in m for m in dashboard["newMaterials"]))

    def test_pdf_upload_source_creation_and_download_authorization(self):
        teacher,_=self.login()
        self.assert_error(teacher.post(BASE+"/classes/cls_1/files",files={"file":("wrong.txt",b"plain text","text/plain")}),415)
        fixture_pdf=self.request(teacher,"GET","/files/file_src_math_1/download")
        self.assertTrue(fixture_pdf.content.startswith(b"%PDF-"))
        self.assertIn("application/pdf",fixture_pdf.headers["content-type"])
        uploaded=self.request(teacher,"POST","/classes/cls_1/files",expected=201,
                              files={"file":("new.pdf",fixture_pdf.content,"application/pdf")}).json()
        source=self.request(teacher,"POST","/classes/cls_1/sources",expected=201,
                            json={"fileId":uploaded["id"],"title":"업로드 가상 자료","unit":"2단원"}).json()
        self.assertEqual(source["subject"],"math")
        self.assertEqual(source["fileId"],uploaded["id"])
        self.assertIsNone(source["thumbnailUrl"])
        self.request(teacher,"GET","/files/"+uploaded["id"]+"/download")
        student,_=self.login("s_a")
        self.assert_error(student.get(BASE+"/files/"+uploaded["id"]+"/download"),404)
        self.assert_error(student.post(BASE+"/classes/cls_1/files",files={"file":("new.pdf",fixture_pdf.content,"application/pdf")}),403)
        science,_=self.login("t_science")
        self.assert_error(science.post(BASE+"/classes/cls_1/sources",json={"fileId":uploaded["id"],"title":"잘못된 연결"}),404)

    def test_archived_source_and_inactive_membership_remove_access(self):
        teacher,_=self.login()
        mock_server.STATE["sources"]["src_math_1"]["archived"]=True
        self.assert_error(teacher.get(BASE+"/files/file_src_math_1/download"),404)
        self.assertEqual(self.items(teacher,"/classes/cls_1/activity"),[])
        self.assertEqual(self.items(teacher,"/classes/cls_1/materials"),[])
        self.assertEqual(self.request(teacher,"GET","/classes/cls_1/dashboard").json()["pendingReviewQuizSetCount"],0)
        student,_=self.login("s_a")
        self.assert_error(student.get(BASE+"/quizzes/quiz_a_math_1"),404)
        mock_server.STATE["memberships"]["mem_t_math"]["status"]="left"
        self.assert_error(teacher.get(BASE+"/classes/cls_1/students"),404)

    def test_unverified_teacher_cannot_login(self):
        mock_server.STATE["users"]["usr_t_math"]["verified"]=False
        self.assert_error(self.client().post(BASE+"/auth/login",json={"loginId":"t_math","password":PASSWORD,"role":"teacher"}),401,403)

    def test_queued_job_does_not_switch_to_another_credential_after_revocation(self):
        teacher,_=self.login()
        payload={"sourceId":"src_math_1","studentMemberIds":["mem_s_a"],"operation":"convert"}
        job=self.request(teacher,"POST","/classes/cls_1/generation-jobs",expected=202,json=payload,headers={"Idempotency-Key":"pinned-key"}).json()["items"][0]
        self.request(teacher,"DELETE","/ai-credentials/cred_t_math",expected=204)
        other=self.request(teacher,"POST","/ai-credentials",expected=201,json={"apiKey":"mock-replacement-key"}).json()
        self.request(teacher,"POST","/ai-credentials/"+other["id"]+"/check")
        failed=self.request(teacher,"GET","/generation-jobs/"+job["id"]).json()
        self.assertEqual(failed["status"],"failed")
        self.assertEqual(failed["errorCode"],"AI_CREDENTIAL_REQUIRED")
        self.assertIsNone(failed["resultId"])

    def test_weighted_first_score_is_distinct_from_correct_question_count(self):
        for q,points in zip(mock_server.STATE["quizzes"]["quiz_a_math_1"]["questions"],[2,3,5]):
            q["maxPoints"]=points
        student,_=self.login("s_a")
        path="/quizzes/quiz_a_math_1"
        for index,option in [(1,"2"),(2,"1"),(3,"1")]:
            self.request(student,"POST",path+"/answers",json={"questionId":f"quiz_a_math_1_q{index}","selectedOptionId":option},headers={"Idempotency-Key":f"weighted-{index}"})
        result=self.request(student,"GET",path+"/results").json()
        self.assertEqual((result["firstScore"],result["maxScore"],result["firstCorrectCount"],result["questionCount"]),(8,10,2,3))
        changed=self.request(student,"POST",path+"/answers",json={"questionId":"quiz_a_math_1_q1","selectedOptionId":"1"},headers={"Idempotency-Key":"weighted-retry"}).json()["results"]
        self.assertEqual(changed["firstScore"],8)
        self.assertEqual(changed["firstCorrectCount"],2)
        self.assertEqual(changed["latestCorrectCount"],3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
