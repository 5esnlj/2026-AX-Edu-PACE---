import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptSources, adaptTeacherDashboard, adaptStudentDashboard } from '../.test-build/api/adapters.js';
import { createTransport, ApiError } from '../.test-build/api/transport.js';

const scores = (overrides = {}) => ({ status: 'completed', questionCount: 10, submittedQuestionCount: 10, firstCorrectCount: 3, firstScore: 30, currentWrongCount: 1, unansweredQuestionCount: 0, ...overrides });
const teacher = (overrides = {}) => ({ classId: 'cls_1', className: '3학년 2반', selectedArea: 'math', teacherSubject: 'math', studentCount: 2, levelCounts: { below_beginner: 1, beginner: 0, intermediate: 0, advanced: 0, not_diagnosed: 1 }, pendingReviewQuizSetCount: 2, students: [
  { studentMemberId: 'a', displayName: 'A', nativeLanguage: 'zh', diagnosticStatus: 'completed', parts: [{ area: 'math', skill: 'listening', score: 20, maxScore: 100, level: 'below_beginner' }], aggregate: { area: 'math', score: 40, maxScore: 200, level: 'below_beginner' }, latestQuiz: scores() },
  { studentMemberId: 'b', displayName: 'B', nativeLanguage: 'vi', diagnosticStatus: 'in_progress', parts: [], aggregate: null, latestQuiz: null },
], ...overrides });
const student = (overrides = {}) => ({ classId: 'cls_1', className: '3학년 2반', displayName: 'A', selectedArea: 'daily', parts: [{ area: 'daily', skill: 'reading', score: 75, maxScore: 100, level: 'advanced' }], aggregate: { area: 'daily', score: 100, maxScore: 200, level: 'beginner' }, unansweredQuestionCount: 6, retryQuestionCount: 2, newMaterials: [{ id: 'm', subject: 'math', unit: '분수 단원', title: '분수', publishedAt: '2026-01-01T00:00:00Z', isRecentPublished: false }], quizzes: [{ id: 'q', title: '문제', subject: 'math', progress: scores({ status: 'in_progress', submittedQuestionCount: 4, firstCorrectCount: null, firstScore: null, currentWrongCount: 2, unansweredQuestionCount: 6 }) }], ...overrides });

test('four levels and incomplete diagnosis remain distinct; class and area come from API', () => {
  const out = adaptTeacherDashboard(teacher());
  assert.equal(out.className, '3학년 2반'); assert.equal(out.subject, '수학');
  assert.equal(out.levelCounts['초급 미달'], 1); assert.equal(out.levelCounts['진단 미완료'], 1);
  assert.equal(out.students[0].overall, '초급 미달'); assert.equal(out.students[1].overall, null);
  assert.equal(out.students[0].nativeLanguage, '중국어');
});
test('first score stays separate from current wrong count and absent/in-progress quiz', () => {
  const raw = teacher(); raw.students[1].latestQuiz = scores({ status: 'in_progress', submittedQuestionCount: 2, firstCorrectCount: null, currentWrongCount: 1 });
  const out = adaptTeacherDashboard(raw);
  assert.deepEqual(out.students[0].recentScore, { correct: 3, total: 10 }); assert.equal(out.students[0].wrongCount, 1);
  assert.equal(out.students[1].recentScore, null); assert.equal(out.students[1].recentStatus, '푸는 중');
  raw.students[1].latestQuiz = scores({ status: 'not_started', submittedQuestionCount: 0, firstCorrectCount: null, currentWrongCount: 0 });
  assert.equal(adaptTeacherDashboard(raw).students[1].wrongCount, null);
});
test('teacher cards are source IDs and only own subject; unit is not a fabricated number', () => {
  const out = adaptSources([{ id: 'src_1', subject: 'math', title: '분수', unit: '분수 덧셈', createdAt: '2026-01-01T00:00:00Z' }, { id: 'other', subject: 'science', title: '물', unit: '물', createdAt: '2026-01-01T00:00:00Z' }], 'math');
  assert.equal(out.materials.length, 1); assert.equal(out.materials[0].id, 'src_1'); assert.equal(out.materials[0].unit, '분수 덧셈');
});
test('student progress means submitted fraction, current wrong count is not retry count', () => {
  const out = adaptStudentDashboard(student());
  assert.equal(out.todoCount, 6); assert.equal(out.questionSets[0].progress, 0.4); assert.equal(out.questionSets[0].status, '푸는 중');
  assert.equal(out.questionSets[0].wrongCount, 2); assert.equal(out.myLevel.reading, '고급'); assert.equal(out.myLevel.listening, null); assert.equal(out.newMaterials[0].isNew, false);
});
test('student not-started, completed-with-wrong and completed-all-correct states', () => {
  for (const [status, wrong, expected] of [['not_started',0,'풀기 전'],['completed',2,'다시 풀기'],['completed',0,'완료']]) {
    const raw = student(); raw.quizzes[0].progress = scores({ status, currentWrongCount: wrong, submittedQuestionCount: status === 'not_started' ? 0 : 10 });
    assert.equal(adaptStudentDashboard(raw).questionSets[0].status, expected);
  }
});
test('transport merges headers, cookies, CSRF and handles empty logout response', async () => {
  let call;
  const client = createTransport('/api/v1/', async (...args) => { call = args; return new Response(null, { status: 204 }); });
  client.setCsrfToken('test-csrf');
  assert.equal(await client.request('/auth/logout', { method: 'POST', headers: { 'If-Match': '"2"' } }), undefined);
  assert.equal(call[0], '/api/v1/auth/logout'); assert.equal(call[1].credentials, 'include'); assert.equal(call[1].headers.get('X-CSRF-Token'), 'test-csrf'); assert.equal(call[1].headers.get('If-Match'), '"2"');
  client.setCsrfToken(null); await client.request('/auth/logout', { method: 'POST' }); assert.equal(call[1].headers.get('X-CSRF-Token'), null);
});
test('transport preserves browser multipart boundary and does not send CSRF on GET', async () => {
  let call;
  const client = createTransport('/api/v1', async (...args) => { call = args; return Response.json({ ok: true }); }); client.setCsrfToken('test-csrf');
  await client.request('/files', { method: 'POST', body: new FormData() }); assert.equal(call[1].headers.get('Content-Type'), null);
  await client.request('/classes'); assert.equal(call[1].headers.get('X-CSRF-Token'), null);
});
test('transport exposes server error code and request ID; network failures are actionable', async () => {
  const client = createTransport('/api/v1', async () => Response.json({ code: 'DIAGNOSTIC_INCOMPLETE', message: '진단을 완료하세요.', requestId: 'req_test' }, { status: 409 }));
  await assert.rejects(client.request('/classes/1/dashboard'), (e) => e instanceof ApiError && e.code === 'DIAGNOSTIC_INCOMPLETE' && e.requestId === 'req_test' && e.message === '진단을 완료하세요.');
  const offline = createTransport('/api/v1', async () => { throw new TypeError('network'); }); await assert.rejects(offline.request('/health'), (e) => e.code === 'NETWORK_ERROR');
});
test('ETag metadata and caller concurrency/idempotency headers survive transport', async () => {
  let call;
  const client = createTransport('/api/v1', async (...args) => { call = args; return Response.json({ id: 'm' }, { headers: { ETag: '"3"' } }); });
  client.setCsrfToken('test-csrf');
  const result = await client.requestWithMeta('/materials/m', { method: 'PATCH', headers: { 'If-Match': '"2"', 'Idempotency-Key': 'request-1' }, body: JSON.stringify({ title: '새 제목' }) });
  assert.equal(result.etag, '"3"'); assert.equal(result.status, 200); assert.deepEqual(result.data, { id: 'm' });
  assert.equal(call[1].headers.get('If-Match'), '"2"'); assert.equal(call[1].headers.get('Idempotency-Key'), 'request-1'); assert.equal(call[1].headers.get('Content-Type'), 'application/json');
});
