import { useEffect, useState } from 'react';
import { AppShell, Sidebar, TopBar, type NavKey } from './components';
import { MaterialListPage } from './pages/MaterialListPage';
import { StudentDashboard } from './pages/StudentDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import styles from './App.module.css';

/**
 * 시연용 화면 전환(주소 #/teacher/dashboard 등).
 * TODO(개발자): 실제 프로젝트에서는 쓰고 있는 라우터(react-router 등)로 바꾼다.
 */
type Route = 'teacher/dashboard' | 'teacher/materials' | 'student/dashboard';
const read = (): Route => (location.hash.replace('#/', '') as Route) || 'teacher/dashboard';

export default function App() {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => { const on = () => setRoute(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const go = (r: Route) => { location.hash = `/${r}`; };
  const classId = 'c-302';

  if (route.startsWith('student')) {
    return (
      <AppShell
        topBar={<TopBar userName="아지즈" onLogoClick={() => go('student/dashboard')} />}
        sidebar={<Sidebar role="student" className="3학년 2반" active="dashboard" onNavigate={() => go('student/dashboard')} bottom={<MyLevel />} />}
      >
        <StudentDashboard classId={classId} onSolve={() => {}} onOpenMaterial={() => {}} onAllMaterials={() => {}} onAllQuestions={() => {}} />
      </AppShell>
    );
  }

  const active: NavKey = route === 'teacher/materials' ? 'materials' : 'dashboard';
  return (
    <AppShell
      topBar={<TopBar userName="김가나 선생님" onLogoClick={() => go('teacher/dashboard')} />}
      sidebar={
        <Sidebar
          role="teacher" className="3학년 2반" active={active}
          onNavigate={(k) => k === 'materials' ? go('teacher/materials') : go('teacher/dashboard')}
          bottom={<div className={styles.pending}><small>검토 기다리는 문항</small><span><b>2건</b><em>검토하기 ›</em></span></div>}
        />
      }
    >
      {route === 'teacher/materials'
        ? <MaterialListPage classId={classId} onNew={() => {}} onOpen={() => {}} />
        : <TeacherDashboard classId={classId} onOpenStudent={() => {}} />}
    </AppShell>
  );
}

function MyLevel() {
  return (
    <div className={styles.myLevel}>
      <small>내 수준</small>
      {([['듣기', '중급', 0.6], ['읽기', '초급', 0.3]] as const).map(([a, b, v]) => (
        <div key={a}><span><b>{a}</b><em>{b}</em></span><i style={{ ['--v' as string]: v }} /></div>
      ))}
    </div>
  );
}
