"""Regressions for the three supplied frontend screens and API v1.1 additions.

The original test_api suite covers core flows; these cases exercise the new DTO
fields and dashboard/card integration without duplicating every original case.
"""
import unittest

import mock_server
import test_api as existing


class FrontendContractTests(unittest.TestCase):
    setUp = existing.ApiContractTests.setUp
    tearDown = existing.ApiContractTests.tearDown
    client = existing.ApiContractTests.client
    login = existing.ApiContractTests.login
    request = existing.ApiContractTests.request
    validate_schema = existing.ApiContractTests.validate_schema
    items = existing.ApiContractTests.items

    def test_dashboard_names_and_pending_status_are_not_guessed_from_levels(self):
        mock_server.STATE['classes']['cls_1']['name'] = '이름이 변경된 반'
        mock_server.STATE['memberships']['mem_s_new'] = dict(
            id='mem_s_new', classId='cls_1', userId='usr_s_new',
            role='student', teacherSubject=None, status='active')
        teacher, _ = self.login()
        dashboard = self.request(teacher, 'GET', '/classes/cls_1/dashboard?area=korean').json()
        self.assertEqual(dashboard['className'], '이름이 변경된 반')
        rows = {r['studentMemberId']: r for r in dashboard['students']}
        self.assertEqual(rows['mem_s_a']['diagnosticStatus'], 'completed')
        self.assertEqual(rows['mem_s_b']['diagnosticStatus'], 'completed')
        self.assertEqual(rows['mem_s_pending']['diagnosticStatus'], 'in_progress')
        self.assertEqual(rows['mem_s_new']['diagnosticStatus'], 'not_started')
        # A completed below-beginner PART is different from an uncompleted test.
        self.assertEqual({p['level'] for p in rows['mem_s_b']['parts']}, {'below_beginner'})
        self.assertEqual(rows['mem_s_b']['aggregate']['level'], 'beginner')
        for mid in ['mem_s_pending', 'mem_s_new']:
            self.assertEqual(rows[mid]['parts'], [])
            self.assertIsNone(rows[mid]['aggregate'])
        self.assertEqual(dashboard['levelCounts']['not_diagnosed'], 2)
        self.assertEqual(sum(dashboard['levelCounts'].values()), dashboard['studentCount'])
        students = self.items(teacher, '/classes/cls_1/students')
        all_part_levels = {p['level'] for row in students for p in row['partResults']}
        self.assertEqual(all_part_levels, {'below_beginner', 'beginner', 'intermediate', 'advanced'})
        student, _ = self.login('s_a')
        self.assertEqual(self.request(student, 'GET', '/classes/cls_1/dashboard').json()['className'], '이름이 변경된 반')

    def test_current_roster_counts_and_activity_exclude_inactive_accounts(self):
        for status in ['suspended', 'deleted', 'pending']:
            with self.subTest(status=status):
                mock_server.reset_state()
                teacher, _ = self.login()
                self.assertTrue(self.items(teacher, '/classes/cls_1/activity'))
                mock_server.STATE['users']['usr_s_a']['status'] = status
                # Departed B's draft should no longer inflate the review queue.
                mock_server.STATE['memberships']['mem_s_b']['status'] = 'left'
                dashboard = self.request(teacher, 'GET', '/classes/cls_1/dashboard').json()
                self.assertEqual(dashboard['studentCount'], 1)
                self.assertEqual([r['studentMemberId'] for r in dashboard['students']], ['mem_s_pending'])
                self.assertEqual(dashboard['levelCounts']['not_diagnosed'], 1)
                self.assertEqual(sum(dashboard['levelCounts'].values()), 1)
                self.assertEqual(dashboard['pendingReviewQuizSetCount'], 0)
                self.assertEqual([r['id'] for r in self.items(teacher, '/classes/cls_1/students')], ['mem_s_pending'])
                self.assertEqual(self.items(teacher, '/classes/cls_1/activity'), [])
                self.request(teacher, 'GET', '/classes/cls_1/students/mem_s_a/diagnostic', expected=404)
                # Historical resources remain stored; this is filtering, not deletion.
                self.assertIn('quiz_a_math_1', mock_server.STATE['quizzes'])

    def test_material_cards_get_source_unit_and_do_not_invent_unit_number(self):
        source = mock_server.STATE['sources']['src_math_1']
        source['unit'] = '2-1. 비와 비율'
        teacher, _ = self.login()
        source_cards = self.items(teacher, '/classes/cls_1/sources')
        self.assertEqual(len(source_cards), 1)
        self.assertEqual(source_cards[0]['id'], 'src_math_1')
        self.assertEqual(source_cards[0]['unit'], source['unit'])
        # Two personalized versions do not become two teacher original cards.
        self.assertEqual(len(self.items(teacher, '/classes/cls_1/materials')), 2)
        student, _ = self.login('s_a')
        math_card = next(m for m in self.items(student, '/classes/cls_1/materials') if m['id'] == 'mat_a_math_1')
        self.assertEqual(math_card['unit'], source['unit'])
        self.assertIsNone(math_card['unitNumber'])
        detail = self.request(student, 'GET', '/materials/mat_a_math_1').json()
        self.assertEqual(detail['unit'], source['unit'])
        dashboard = self.request(student, 'GET', '/classes/cls_1/dashboard').json()
        self.assertEqual(next(m['unit'] for m in dashboard['newMaterials'] if m['id'] == 'mat_a_math_1'), source['unit'])
        source['unit'] = ''
        self.assertEqual(self.request(student, 'GET', '/materials/mat_a_math_1').json()['unit'], '')

    def test_dashboard_score_and_current_wrong_count_survive_retry(self):
        for q, points in zip(mock_server.STATE['quizzes']['quiz_a_math_1']['questions'], [2, 3, 5]):
            q['maxPoints'] = points
        student, _ = self.login('s_a')
        teacher, _ = self.login()
        for index, option in [(1, '2'), (2, '1'), (3, '1')]:
            self.request(student, 'POST', '/quizzes/quiz_a_math_1/answers',
                         json={'questionId': f'quiz_a_math_1_q{index}', 'selectedOptionId': option},
                         headers={'Idempotency-Key': f'fe-first-{index}'})
        def teacher_latest():
            data = self.request(teacher, 'GET', '/classes/cls_1/dashboard').json()
            return next(r['latestQuiz'] for r in data['students'] if r['studentMemberId'] == 'mem_s_a')
        before = teacher_latest()
        self.assertEqual((before['firstScore'], before['maxScore'], before['firstCorrectCount'], before['currentWrongCount']), (8, 10, 2, 1))
        student_home = self.request(student, 'GET', '/classes/cls_1/dashboard').json()
        self.assertEqual(student_home['retryQuestionCount'], 1)
        self.assertEqual(student_home['unansweredQuestionCount'], 3)  # Other subject's quiz.
        self.request(student, 'POST', '/quizzes/quiz_a_math_1/answers',
                     json={'questionId': 'quiz_a_math_1_q1', 'selectedOptionId': '1'},
                     headers={'Idempotency-Key': 'fe-retry-1'})
        after = teacher_latest()
        self.assertEqual((after['firstScore'], after['firstCorrectCount'], after['latestCorrectCount'], after['currentWrongCount']), (8, 2, 3, 0))
        self.assertEqual(self.request(student, 'GET', '/classes/cls_1/dashboard').json()['retryQuestionCount'], 0)

    def test_dashboard_area_selection_does_not_expand_subject_permissions(self):
        student, _ = self.login('s_a')
        for index in [1, 2, 3]:
            self.request(student, 'POST', '/quizzes/quiz_a_science_1/answers',
                         json={'questionId': f'quiz_a_science_1_q{index}', 'selectedOptionId': '1'},
                         headers={'Idempotency-Key': f'fe-science-{index}'})
        teacher, _ = self.login()
        data = self.request(teacher, 'GET', '/classes/cls_1/dashboard?area=science').json()
        self.assertEqual(data['selectedArea'], 'science')
        self.assertEqual(data['teacherSubject'], 'math')
        latest = next(r['latestQuiz'] for r in data['students'] if r['studentMemberId'] == 'mem_s_a')
        self.assertEqual(latest['quizId'], 'quiz_a_math_1')
        self.assertIsNone(latest['firstScore'])
        self.assertEqual({r['quizId'] for r in self.items(teacher, '/classes/cls_1/activity')}, {'quiz_a_math_1'})
        self.request(student, 'GET', '/classes/cls_1/students', expected=403)
        self.request(student, 'GET', '/classes/cls_2/dashboard', expected=404)
        self.request(self.client(), 'GET', '/classes/cls_1/dashboard', expected=401)
        pending, _ = self.login('s_pending')
        self.request(pending, 'GET', '/classes/cls_1/dashboard', expected=403)

    def test_v11_schema_requires_new_fields_without_duplicate_home_endpoint(self):
        document = mock_server.app.openapi()
        self.assertEqual(document['info']['version'], '1.1.0')
        operation_count = sum(method in ['get','post','put','patch','delete']
                              for methods in document['paths'].values() for method in methods)
        self.assertEqual(operation_count, 41)
        self.assertFalse(any('/student/home' in path for path in document['paths']))
        models = document['components']['schemas']
        for model in ['TeacherDashboard', 'StudentDashboard']:
            self.assertIn('className', models[model]['required'])
        self.assertIn('diagnosticStatus', models['DashboardStudentRow']['required'])
        self.assertEqual(models['DashboardStudentRow']['properties']['diagnosticStatus']['$ref'], '#/components/schemas/DiagnosticStateCode')
        self.assertEqual(set(models['DiagnosticStateCode']['enum']), {'not_started','in_progress','completed'})
        self.assertIn('unit', models['MaterialOut']['required'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
