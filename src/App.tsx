import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Heart,
  HelpCircle,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Route as RouteIcon,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, useResource } from "./api";
import {
  Avatar,
  Badge,
  ErrorState,
  Loading,
  Logo,
  useToast,
} from "./components";
import { Dashboard } from "./pages/Dashboard";
import {
  About,
  Diagnostic,
  Glossary,
  Messages,
  Reports,
  Roadmap,
  Students,
} from "./pages/Learning";
import { CreateMaterial, MaterialDetail, Materials } from "./pages/Materials";
import { QuizPage, Quizzes } from "./pages/Quizzes";
import { useSession } from "./session";
import type { Role, Student } from "./types";
import { languages } from "./types";

function Welcome() {
  const { user, refresh } = useSession();
  const [role, setRole] = useState<Role>("teacher");
  const [student, setStudent] = useState("std-1");
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useResource<{ students: Student[] }>("/demo");
  const toast = useToast();
  const navigate = useNavigate();
  if (user) return <Navigate to="/app" replace />;
  async function enter() {
    setBusy(true);
    try {
      await api("/demo/session", {
        method: "POST",
        body: JSON.stringify({ role, student_id: student }),
      });
      await refresh();
      navigate("/app");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="welcome">
      <header>
        <Logo />
        <Badge tone="neutral">PACE · 해커톤 프로토타입</Badge>
      </header>
      <main className="welcome-main">
        <div className="welcome-story">
          <span className="eyebrow">다른 언어에서, 같은 배움으로</span>
          <h1>
            배움과 배움 사이,
            <br />
            <span>우리의 이음.</span>
          </h1>
          <p>
            한국어가 아직 낯설어도, 배움은 이어지도록.
            <br />
            모든 학생이 함께 자라는 교실을 만들어 가요.
          </p>
          <div className="welcome-art" aria-hidden="true">
            <span className="art-sun">✺</span>
            <div className="art-word word-one">안녕!</div>
            <div className="art-word word-two">Xin chào</div>
            <div className="art-step s1">
              <Heart size={28} />
            </div>
            <div className="art-step s2">
              <BookOpen size={37} />
            </div>
            <div className="art-step s3">
              <Sparkles size={39} />
            </div>
            <div className="art-caption">서로를 이해하는 작은 한 걸음</div>
          </div>
        </div>
        <section className="entry-card">
          <span className="eyebrow">반가워요, 이음입니다</span>
          <h2>어떤 교실로 들어갈까요?</h2>
          <p>역할을 선택하고 이음을 경험해 보세요.</p>
          <div className="role-options">
            {(
              [
                {
                  id: "teacher",
                  title: "선생님이에요",
                  sub: "학생을 이해하고, 수업을 준비해요",
                  icon: Users,
                },
                {
                  id: "student",
                  title: "학생이에요",
                  sub: "나에게 맞는 속도로 배워요",
                  icon: GraduationCap,
                },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                className={`role-option ${role === r.id ? "selected" : ""}`}
                aria-pressed={role === r.id}
                onClick={() => setRole(r.id)}
              >
                <span className="role-icon">
                  <r.icon size={24} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.sub}</small>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          {role === "student" && (
            <label className="field">
              예시 학생 선택
              <select
                value={student}
                onChange={(e) => setStudent(e.target.value)}
              >
                {data?.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {languages[s.language]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error ? (
            <ErrorState message={error} retry={reload} />
          ) : (
            <button
              className="btn full"
              onClick={enter}
              disabled={busy || !data}
            >
              {busy ? "교실에 들어가고 있어요…" : "데모 교실 입장하기"}
              <ChevronRight size={18} />
            </button>
          )}
          <div className="entry-notice">
            <span>DEMO</span> 실제 계정 없이 합성 예시 데이터로 체험합니다.
            <br />
            개인정보·실제 학생 자료는 입력하지 마세요.
          </div>
        </section>
      </main>
      <footer>
        다름을 잇고, 배움을 넓히다. <span>© 이음 · PACE</span>
      </footer>
    </div>
  );
}

const teacherNav = [
  { to: "/app", label: "우리 반 한눈에", icon: LayoutDashboard, end: true },
  { to: "/app/materials", label: "수업 자료", icon: BookOpen },
  { to: "/app/students", label: "학생 관리", icon: Users },
  { to: "/app/reports", label: "학습 리포트", icon: ClipboardCheck },
  { to: "/app/glossary", label: "교과어 검토", icon: Languages },
  { to: "/app/quizzes", label: "이해 확인 문항", icon: FileText },
  { to: "/app/messages", label: "메시지", icon: MessageCircle },
];
const studentNav = [
  { to: "/app", label: "나의 교실", icon: LayoutDashboard, end: true },
  { to: "/app/materials", label: "나의 수업 자료", icon: BookOpen },
  { to: "/app/diagnostic", label: "한국어 자가 점검", icon: Languages },
  { to: "/app/quizzes", label: "이해 확인", icon: ClipboardCheck },
  { to: "/app/roadmap", label: "나의 배움길", icon: RouteIcon },
  { to: "/app/messages", label: "선생님과 이야기", icon: MessageCircle },
];

function Layout() {
  const { user, loading, logout } = useSession();
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const toast = useToast();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/" replace />;
  const nav = user.role === "teacher" ? teacherNav : studentNav;
  const current =
    nav.find((n) => n.to !== "/app" && location.pathname.startsWith(n.to))
      ?.label || "교실 홈";
  async function exit() {
    try {
      await logout();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        본문으로 이동
      </a>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link to="/app" className="brand-link" onClick={() => setMobile(false)}>
          <Logo />
        </Link>
        <div className="class-select">
          <span className="class-symbol">
            <GraduationCap size={20} />
          </span>
          <div>
            <small>우리의 배움 공간</small>
            <strong>{user.class_name}</strong>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-caption">
          {user.role === "teacher" ? "TEACHER WORKSPACE" : "MY LEARNING"}
        </p>
        <nav aria-label="주 메뉴">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <n.icon size={19} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span>
              작은 이해가 모여
              <br />
              <strong>큰 배움이 되어요.</strong>
            </span>
            <span className="note-flower">✿</span>
          </div>
          <NavLink
            to="/app/about"
            className="nav-item"
            onClick={() => setMobile(false)}
          >
            <HelpCircle size={18} />
            플랫폼 안내
            <ArrowUpRight size={14} />
          </NavLink>
          <div className="profile">
            <Avatar name={user.name} index={user.role === "teacher" ? 2 : 0} />
            <div>
              <strong>
                {user.name}
                {user.role === "teacher" ? " 선생님" : ""}
              </strong>
              <small>
                {user.role === "teacher"
                  ? "담임 · 사회 교과"
                  : languages[user.student!.language]}
              </small>
            </div>
            <button
              className="icon-btn"
              onClick={exit}
              aria-label="로그아웃 및 역할 변경"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label={mobile ? "메뉴 닫기" : "메뉴 열기"}
            >
              {mobile ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>나의 워크스페이스</span>
            <ChevronRight size={14} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <span className="semester">함께 배우는 교실</span>
            <Badge tone="neutral">
              <span className="status-dot" /> 데모 모드
            </Badge>
            <Link
              to="/app/messages"
              className="icon-btn"
              aria-label="메시지 보기"
            >
              <MessageCircle size={20} />
            </Link>
          </div>
        </header>
        <main id="content" className="content" key={user.role}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <Logo small />
          <span>모든 학생의 배움이 이어지는 곳</span>
          <span>예시 데이터 · AI 미연결</span>
        </footer>
      </div>
    </div>
  );
}

function TeacherOnly({ children }: { children: React.ReactNode }) {
  return useSession().user?.role === "teacher" ? (
    children
  ) : (
    <Navigate to="/app" replace />
  );
}
function StudentOnly({ children }: { children: React.ReactNode }) {
  return useSession().user?.role === "student" ? (
    children
  ) : (
    <Navigate to="/app" replace />
  );
}

export function App() {
  const { loading } = useSession();
  if (loading) return <Loading />;
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="materials" element={<Materials />} />
        <Route path="materials/:id" element={<MaterialDetail />} />
        <Route
          path="create"
          element={
            <TeacherOnly>
              <CreateMaterial />
            </TeacherOnly>
          }
        />
        <Route
          path="students"
          element={
            <TeacherOnly>
              <Students />
            </TeacherOnly>
          }
        />
        <Route
          path="reports"
          element={
            <TeacherOnly>
              <Reports />
            </TeacherOnly>
          }
        />
        <Route
          path="glossary"
          element={
            <TeacherOnly>
              <Glossary />
            </TeacherOnly>
          }
        />
        <Route
          path="diagnostic"
          element={
            <StudentOnly>
              <Diagnostic />
            </StudentOnly>
          }
        />
        <Route
          path="roadmap"
          element={
            <StudentOnly>
              <Roadmap />
            </StudentOnly>
          }
        />
        <Route path="quizzes" element={<Quizzes />} />
        <Route path="quizzes/:id" element={<QuizPage />} />
        <Route path="messages" element={<Messages />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
