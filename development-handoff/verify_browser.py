"""Local mock integration smoke. Start a fresh API on8081 and Vite on5173 first.
Requires optional Python playwright; pass --browser for installed Chromium.
This test submits synthetic quiz answers; it refuses non-loopback/non-mock hosts.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).parent

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    parser.add_argument('--browser')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    assert urlparse(base).hostname in ['localhost', '127.0.0.1'], 'Use local mock only.'
    output = ROOT / 'screenshots'
    output.mkdir(exist_ok=True)
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=args.browser, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='ko-KR')
        page = context.new_page()
        js_errors = []
        page.on('pageerror', lambda error: js_errors.append(str(error)))
        health = context.request.get(base + '/api/v1/health').json()
        assert health['mode'] == 'mock' and health['isSynthetic'] and not health['databaseConnected']
        page.goto(base)

        def login(login_id, role):
            expect(page.get_by_role('heading', name='API 연동 확인용 로그인')).to_be_visible()
            page.get_by_role('combobox').first.select_option(role)
            page.get_by_label('아이디', exact=True).fill(login_id)
            page.get_by_role('button', name='로그인', exact=True).click()
            expect(page.get_by_role('button', name='로그아웃', exact=True)).to_be_visible()

        def logout():
            page.get_by_role('button', name='로그아웃', exact=True).click()
            expect(page.get_by_role('heading', name='API 연동 확인용 로그인')).to_be_visible()

        login('t_math', 'teacher')
        expect(page.get_by_role('heading', name='가상 3학년 2반', exact=True)).to_be_visible()
        expect(page.get_by_text('중국어', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='초급 미달', exact=True)).to_be_visible()
        page.get_by_role('button', name='진단 미완료', exact=True).click()
        expect(page.locator('tbody tr')).to_have_count(1)
        expect(page.locator('tbody')).to_contain_text('s_pending')
        page.get_by_role('button', name='전체', exact=True).click()
        expect(page.locator('tbody tr')).to_have_count(3)
        page.screenshot(path=str(output / 'teacher-dashboard.png'), full_page=True)
        checks.append('teacher dashboard: live names, four levels, pending filter')

        page.get_by_role('button', name='자료 제작', exact=True).click()
        expect(page.get_by_role('heading', name='수학 · 내 교과')).to_be_visible()
        expect(page.locator('main')).to_contain_text('비와 비율 (가상)')
        expect(page.locator('main')).not_to_contain_text('물질의 상태')
        expect(page.locator('main')).not_to_contain_text('다른 교과')
        page.screenshot(path=str(output / 'teacher-materials.png'), full_page=True)
        checks.append('teacher source cards: only own subject, source identity')
        logout()

        login('t_science', 'teacher')
        page.get_by_role('button', name='자료 제작', exact=True).click()
        expect(page.get_by_role('heading', name='과학 · 내 교과')).to_be_visible()
        expect(page.locator('main')).to_contain_text('물질의 상태 (가상)')
        expect(page.locator('main')).not_to_contain_text('비와 비율')
        checks.append('switch teacher: subject restriction changes with authenticated membership')
        logout()

        login('s_a', 'student')
        expect(page.get_by_role('heading', name='안녕하세요, 학생 A (가상)!')).to_be_visible()
        expect(page.get_by_text('내 수준 · 생활한국어')).to_be_visible()
        page.get_by_label('진단 수준을 볼 영역').select_option('math')
        expect(page.get_by_text('내 수준 · 수학')).to_be_visible()
        page.screenshot(path=str(output / 'student-dashboard.png'), full_page=True)
        page.reload()
        expect(page.get_by_role('heading', name='안녕하세요, 학생 A (가상)!')).to_be_visible()
        checks.append('student dashboard: selected area, real data, session survives reload')

        session = context.request.get(base + '/api/v1/auth/me').json()
        initial = context.request.get(base + '/api/v1/quizzes/quiz_a_math_1/results').json()
        assert initial['submittedQuestionCount'] == 0, 'Restart the mock server for a fresh smoke run.'
        def answer(n, selected, key):
            response = context.request.post(base + '/api/v1/quizzes/quiz_a_math_1/answers',
                data={'questionId': f'quiz_a_math_1_q{n}', 'selectedOptionId': selected},
                headers={'X-CSRF-Token': session['csrfToken'], 'Idempotency-Key': key})
            assert response.status == 200, response.text()
        answer(1, '2', 'browser-first-1')
        page.reload()
        row = page.locator('tbody tr').filter(has_text='비와 비율')
        expect(row).to_contain_text('푸는 중')
        expect(row).to_contain_text('33%')
        answer(2, '1', 'browser-first-2')
        answer(3, '1', 'browser-first-3')
        page.reload()
        expect(row).to_contain_text('다시 풀기')
        expect(row).to_contain_text('100%')
        answer(1, '1', 'browser-retry-1')
        page.reload()
        expect(row).to_contain_text('완료')
        result = context.request.get(base + '/api/v1/quizzes/quiz_a_math_1/results').json()
        assert (result['firstCorrectCount'], result['latestCorrectCount'], result['currentWrongCount']) == (2, 3, 0)
        checks.append('real API answer state: 33% in progress → retry → complete, first score retained')

        page.route('**/api/v1/classes/cls_1/dashboard*', lambda route: route.abort())
        page.reload()
        expect(page.get_by_role('alert')).to_contain_text('연결할 수 없습니다')
        page.unroute('**/api/v1/classes/cls_1/dashboard*')
        page.get_by_role('button', name='다시 불러오기', exact=True).click()
        expect(page.get_by_role('heading', name='안녕하세요, 학생 A (가상)!')).to_be_visible()
        checks.append('request failure is visible, retry recovers')
        logout()

        login('s_pending', 'student')
        expect(page.get_by_role('heading', name='첫 진단평가가 필요합니다')).to_be_visible()
        expect(page.get_by_label('진단 수준을 볼 영역')).to_have_count(0)
        checks.append('unfinished diagnostic gate')
        logout()
        login('s_new', 'student')
        expect(page.get_by_role('heading', name='클래스 참여가 필요합니다')).to_be_visible()
        checks.append('membership-required gate')
        assert not js_errors, js_errors
        report = {'passed': len(checks), 'checks': checks, 'javascriptErrors': js_errors,
                  'scope': 'local mock HTTP via Vite proxy; no real DB/Solar; screenshots are not a Figma comparison'}
        (ROOT / 'browser-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        browser.close()

if __name__ == '__main__':
    main()
