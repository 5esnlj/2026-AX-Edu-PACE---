import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, SUBJECT_LABELS } from './api';
import type { AreaCode, ClassOut, SessionOut } from './api/wire';
import { AppShell, Button, Sidebar, TopBar, type NavKey } from './components';
import { useApi } from './hooks';
import { MaterialListPage } from './pages/MaterialListPage';
import { StudentDashboard } from './pages/StudentDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import type { Role } from './types';
import styles from './App.module.css';

export default function App() {
  const [session, setSession] = useState<SessionOut | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.me().then((s) => { if (alive) setSession(s); }).catch((e: unknown) => { if (alive && !(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : '로그인 상태를 확인하지 못했습니다.'); }).finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []);
  async function logout() {
    try { await api.logout(); setSession(null); setError(null); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { setSession(null); setError(null); } else setError(e instanceof Error ? e.message : '로그아웃에 실패했습니다.'); }
  }
  if (booting) return <main className={styles.login}><p>로그인 상태 확인 중…</p></main>;
  if (!session) return <Login initialError={error} onLogin={(s) => { setSession(s); setError(null); }} />;
  return <Authenticated key={session.user.id} session={session} onLogout={logout} sessionError={error} />;
}

function Login({ initialError, onLogin }: { initialError: string | null; onLogin: (session: SessionOut) => void }) {
  const [role, setRole] = useState<Role>('teacher');
  const [loginId, setLoginId] = useState('t_math');
  const [password, setPassword] = useState('mock-pass-123');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { onLogin(await api.login(loginId, password, role)); }
    catch (e) { setError(e instanceof Error ? e.message : '로그인에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  return <main className={styles.login}><h1>가나다계단</h1><h2>API 연동 확인용 로그인</h2>
    <p>이 묶음은 가상 계정을 쓰는 mock입니다. 실제 학생 정보나 API 키를 입력하지 마세요.</p>
    <form onSubmit={submit} className={styles.loginForm}>
      <label>역할<select value={role} onChange={(e) => { const value = e.target.value as Role; setRole(value); setLoginId(value === 'teacher' ? 't_math' : 's_a'); }}><option value="teacher">교사</option><option value="student">학생</option></select></label>
      <label>아이디<input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" required /></label>
      <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</Button>
    </form>
    <p>교사 <code>t_math</code> · 학생 <code>s_a</code><br />예시 비밀번호 <code>mock-pass-123</code></p>
    <small>진단 미완료 학생: s_pending · 클래스 미가입 학생: s_new</small>
  </main>;
}

function Authenticated({ session, onLogout, sessionError }: { session: SessionOut; onLogout: () => void; sessionError: string | null }) {
  const { data, error, retry } = useApi(api.getClasses, [session.user.id]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const selected = data?.items.find((c) => c.id === selectedClassId) ?? data?.items[0];
  const controls = <div className={styles.toolbar}><span>API 연동 확인 · 가상 데이터</span><label>클래스 <select aria-label="클래스 선택" value={selected?.id ?? ''} onChange={(e) => setSelectedClassId(e.target.value)} disabled={!data?.items.length}>{data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Button variant="secondary" onClick={onLogout}>로그아웃</Button>{sessionError && <span role="alert">{sessionError}</span>}</div>;
  if (error || !data || !selected || session.nextAction !== 'classes') return <AppShell topBar={<TopBar userName={session.user.displayName} />}>
    {controls}
    {error ? <div role="alert"><p>{error.message}</p><Button onClick={retry}>다시 불러오기</Button></div> : !data ? <p>클래스를 불러오는 중…</p> : session.nextAction === 'diagnostic' ? <><h1>첫 진단평가가 필요합니다</h1><p>진단을 완료하기 전에는 학습 화면에 들어갈 수 없습니다. 진단 화면은 아직 이 프론트엔드에 구현하지 않았습니다. 완성된 대시보드를 확인하려면 로그아웃 후 s_a 계정을 사용하세요.</p></> : <><h1>클래스 참여가 필요합니다</h1><p>클래스 개설·초대 수락 화면은 다음 개발 단계입니다. 이 연동본에서는 이미 가입된 가상 계정을 사용해 주세요.</p></>}
  </AppShell>;
  return <Workspace key={`${session.user.id}:${selected.id}`} session={session} currentClass={selected} controls={controls} />;
}

function Workspace({ session, currentClass, controls }: { session: SessionOut; currentClass: ClassOut; controls: React.ReactNode }) {
  const teacher = session.user.role === 'teacher';
  const [nav, setNav] = useState<NavKey>('dashboard');
  const [area, setArea] = useState<AreaCode>('daily');
  const { data, error, retry } = useApi(async () => teacher ? { kind: 'teacher' as const, value: await api.getClassDashboard(currentClass.id) } : { kind: 'student' as const, value: await api.getStudentHome(currentClass.id, area) }, [currentClass.id, teacher, area]);
  const bottom = data?.kind === 'teacher' ? <div className={styles.pending}><small>검토 기다리는 문항 묶음</small><b>{data.value.pendingReviewCount}건</b><small>검토 화면은 다음 개발 단계입니다.</small></div> : data?.kind === 'student' ? <div className={styles.myLevel}><small>내 수준 · {data.value.subject}</small>{(['listening', 'reading'] as const).map((skill) => <div key={skill}><span><b>{skill === 'listening' ? '듣기' : '읽기'}</b><em>{data.value.myLevel[skill] ?? '진단 미완료'}</em></span><small>{data.value.myLevel[`${skill}Score`] ?? '–'} / 100점</small></div>)}</div> : undefined;
  return <AppShell topBar={<TopBar userName={session.user.displayName} onLogoClick={() => setNav('dashboard')} />} sidebar={<Sidebar role={session.user.role} className={currentClass.name} active={nav} onNavigate={setNav} enabledKeys={teacher ? ['dashboard', 'materials'] : ['dashboard']} bottom={bottom} />}>
    {controls}
    {!teacher && <label className={styles.areaSelect}>진단 수준을 볼 영역 <select value={area} onChange={(e) => setArea(e.target.value as AreaCode)}>{Object.entries(SUBJECT_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>}
    {error ? <div role="alert"><p>{error.message}</p><Button onClick={retry}>다시 불러오기</Button></div> : !data ? <p>불러오는 중…</p> : data.kind === 'teacher' ? nav === 'materials' && currentClass.teacherSubject ? <MaterialListPage classId={currentClass.id} subject={currentClass.teacherSubject} /> : <TeacherDashboard data={data.value} /> : <StudentDashboard data={data.value} />}
  </AppShell>;
}
