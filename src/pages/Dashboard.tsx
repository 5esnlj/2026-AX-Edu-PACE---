import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Languages,
  Plus,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useResource } from "../api";
import {
  Avatar,
  Badge,
  ErrorState,
  Loading,
  PageHeading,
  SectionTitle,
} from "../components";
import { useSession } from "../session";
import { languages, type Material, type Quiz, type Report } from "../types";

export function Dashboard() {
  const { user } = useSession();
  const materials = useResource<Material[]>("/materials");
  const reports = useResource<Report[]>(
    user?.role === "teacher" ? "/reports" : null,
  );
  const quizzes = useResource<Quiz[]>("/quizzes");
  if (materials.error || reports.error || quizzes.error)
    return (
      <ErrorState
        message={materials.error || reports.error || quizzes.error}
        retry={() => {
          materials.reload();
          reports.reload();
          quizzes.reload();
        }}
      />
    );
  if (
    !materials.data ||
    !quizzes.data ||
    (user?.role === "teacher" && !reports.data)
  )
    return <Loading />;
  const isTeacher = user?.role === "teacher";
  const rows = reports.data || [];
  const answered = rows.filter((r) => r.attempt);
  const support = rows.filter((r) => r.attempt && r.attempt.kind !== "steady");
  const published = materials.data.filter(
    (m) => m.status === "published",
  ).length;
  const student = user!.student;
  return (
    <>
      <PageHeading
        eyebrow={isTeacher ? "우리 반의 오늘" : "오늘도, 한 걸음"}
        title={`${user!.name}${isTeacher ? " 선생님" : ""}, 반가워요 👋`}
        description={
          isTeacher
            ? "서로 다른 속도의 배움, 오늘도 함께 이어 볼까요?"
            : "천천히 읽고, 새롭게 알아가는 나만의 교실이에요."
        }
        action={
          isTeacher ? (
            <Link to="/app/create" className="btn">
              <Plus size={18} />
              맞춤 자료 만들기
            </Link>
          ) : (
            <Badge tone="green">{languages[student!.language]} 지원</Badge>
          )
        }
      />
      <section className="hero-banner">
        <div className="hero-copy">
          <span className="hero-tag">
            <Sprout size={14} />{" "}
            {isTeacher
              ? "서로를 이해하는 교실"
              : "작은 한 걸음도, 멋진 배움이에요"}
          </span>
          <h2>
            {isTeacher ? (
              <>
                한국어가 낯설어도,
                <br />
                배움에서 멀어지지 않도록.
              </>
            ) : (
              <>
                나에게 맞는 속도로,
                <br />
                오늘의 배움을 이어 가요.
              </>
            )}
          </h2>
          <p>
            {isTeacher
              ? "학생의 한국어 수준에 맞춘 수업 자료로\n모두가 참여하는 교실을 시작해 보세요."
              : "쉬운 글과 낱말 풀이가 준비되어 있어요.\n모르는 말이 있어도 괜찮아요."}
          </p>
          <Link
            to={isTeacher ? "/app/create" : "/app/materials"}
            className="hero-link"
          >
            {isTeacher ? "우리 반 맞춤 자료 준비하기" : "나의 수업 자료 읽기"}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit" />
          <span className="hero-star star-a">✦</span>
          <span className="hero-star star-b">✦</span>
          <div className="speech-bubble">함께라서, 더 멀리!</div>
          <div className="book book-back">
            <div />
          </div>
          <div className="book book-front">
            <div className="book-label">
              가나다
              <br />
              <span>우리의 배움</span>
            </div>
            <div className="book-line" />
            <div className="book-line short" />
            <div className="book-flower">✿</div>
          </div>
          <div className="plant">
            <div className="leaf leaf-one" />
            <div className="leaf leaf-two" />
            <div className="stem" />
            <div className="pot" />
          </div>
        </div>
      </section>
      <div className="stat-grid">
        {(isTeacher
          ? [
              {
                label: "함께하는 학생",
                value: rows.length,
                suffix: "명",
                icon: Users,
                tone: "purple",
                sub: "5개 주 사용 언어가 있는 교실",
              },
              {
                label: "배포한 수업 자료",
                value: published,
                suffix: "개",
                icon: BookOpen,
                tone: "green",
                sub: "학생별 맞춤 자료로 연결 중",
              },
              {
                label: "이해 확인 참여",
                value: answered.length,
                suffix: `/ ${rows.length}명`,
                icon: ClipboardCheck,
                tone: "blue",
                sub: "합성 예시 응답 포함",
              },
              {
                label: "지원 살펴보기",
                value: support.length,
                suffix: "명",
                icon: Sprout,
                tone: "orange",
                sub: "추가 관찰이 필요한 참고 신호",
              },
            ]
          : [
              {
                label: "나의 수업 자료",
                value: published,
                suffix: "개",
                icon: BookOpen,
                tone: "green",
                sub: "선생님이 준비한 맞춤 자료",
              },
              {
                label: "이해 확인",
                value: quizzes.data.filter((q) => !q.attempt).length,
                suffix: "개",
                icon: ClipboardCheck,
                tone: "blue",
                sub: "배운 내용을 함께 확인해요",
              },
              {
                label: "읽기 자가 점검",
                value: student!.levels.reading,
                suffix: "단계",
                icon: Languages,
                tone: "purple",
                sub: "1~4단계 · 표준화 진단 아님",
              },
              {
                label: "함께하는 언어",
                value: languages[student!.language],
                suffix: "",
                icon: Sparkles,
                tone: "orange",
                sub: "교과어 병기를 지원해요",
              },
            ]
        ).map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className={`stat-icon ${stat.tone}`}>
                <stat.icon size={19} />
              </span>
            </div>
            <div className="stat-value">
              {stat.value}
              <small>{stat.suffix}</small>
            </div>
            <p>{stat.sub}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <div>
          <section className="panel student-panel">
            <SectionTitle
              title={isTeacher ? "우리 반 배움 살펴보기" : "오늘의 배움 순서"}
              detail={
                isTeacher
                  ? "생활 한국어와 학습 한국어, 다르게 살펴봐요."
                  : "한 번에 하나씩, 편안하게 시작해요."
              }
              to={isTeacher ? "/app/students" : "/app/roadmap"}
            />
            {isTeacher ? (
              <div className="student-table-wrap">
                <table className="student-table compact">
                  <thead>
                    <tr>
                      <th>학생</th>
                      <th>생활 한국어</th>
                      <th>학습 한국어</th>
                      <th>학습 지원 참고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 4).map((r, i) => (
                      <tr key={r.student.id}>
                        <td>
                          <Link
                            to={`/app/reports?student=${r.student.id}`}
                            className="student-name"
                          >
                            <Avatar name={r.student.name} index={i} />
                            <div>
                              <strong>{r.student.name}</strong>
                              <small>{languages[r.student.language]}</small>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <span className="level-pill">
                            {r.student.everyday}단계
                          </span>
                        </td>
                        <td>
                          <span
                            className={`level-pill ${r.student.academic <= 2 ? "level-low" : ""}`}
                          >
                            {r.student.academic}단계
                          </span>
                        </td>
                        <td>
                          <Badge
                            tone={
                              !r.attempt
                                ? "neutral"
                                : r.attempt.kind === "steady"
                                  ? "green"
                                  : r.attempt.kind === "language"
                                    ? "blue"
                                    : "orange"
                            }
                          >
                            {!r.attempt
                              ? "응답 기다리는 중"
                              : r.attempt.kind === "steady"
                                ? "이번 학습 이해"
                                : r.attempt.kind === "language"
                                  ? "한국어 지원 살피기"
                                  : "함께 살펴보기"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="today-steps">
                {[
                  {
                    to: "/app/diagnostic",
                    icon: Languages,
                    title: "나의 한국어 알아보기",
                    description: "듣기·말하기·읽기·쓰기 자가 점검",
                  },
                  {
                    to: "/app/materials",
                    icon: BookOpen,
                    title: "오늘의 자료 읽기",
                    description: "쉬운 문장과 낱말 뜻으로 이해해요",
                  },
                  {
                    to: "/app/quizzes",
                    icon: ClipboardCheck,
                    title: "배운 내용 확인하기",
                    description: "틀려도 괜찮아요. 다시 배울 수 있어요",
                  },
                ].map((s, i) => (
                  <Link to={s.to} key={s.to}>
                    <span className={`step-icon step-${i}`}>
                      <s.icon size={22} />
                    </span>
                    <div>
                      <strong>{s.title}</strong>
                      <p>{s.description}</p>
                    </div>
                    <ChevronRight size={18} />
                  </Link>
                ))}
              </div>
            )}
            <div className="panel-footnote">
              {isTeacher
                ? "※ 단계는 합성 예시 또는 자가 점검 값입니다. 학생의 능력을 확정하지 않아요."
                : "지금의 점검 결과는 출발점이에요. 언제든 다시 점검할 수 있어요."}
            </div>
          </section>
          <section className="panel recent-panel">
            <SectionTitle title="최근 수업 자료" to="/app/materials" />
            <div className="recent-list">
              {materials.data.slice(0, 2).map((m) => (
                <Link to={`/app/materials/${m.id}`} key={m.id}>
                  <div className="document-icon">
                    <FileText size={24} />
                  </div>
                  <div>
                    <div className="inline-badges">
                      <Badge tone="neutral">{m.subject}</Badge>
                      <small>{m.unit}</small>
                    </div>
                    <strong>{m.title}</strong>
                    <p>
                      {m.status === "published"
                        ? "배포 완료"
                        : m.status === "reviewed"
                          ? "검토 완료"
                          : "교사 검토 대기"}{" "}
                      · {m.targets.length}명 맞춤 자료
                    </p>
                  </div>
                  <ArrowUpRight size={19} />
                </Link>
              ))}
            </div>
          </section>
        </div>
        <div>
          <section className="panel workflow-panel">
            <div className="section-title">
              <h2>
                {isTeacher ? "수업 준비, 이렇게 이어져요" : "나의 배움 도우미"}
              </h2>
              <Sparkles size={18} />
            </div>
            {[
              {
                n: "01",
                title: "학생을 이해해요",
                desc: "영역별 한국어 수준과 배움 기록 확인",
                done: true,
              },
              {
                n: "02",
                title: "맞춤 자료를 준비해요",
                desc: "쉬운 한국어 · 교과어 병기 · 시각 자료",
                done: false,
              },
              {
                n: "03",
                title: "함께 확인하고 자라요",
                desc: "이해 확인과 개별 배움길로 연결",
                done: false,
              },
            ].map((item) => (
              <div className="workflow-step" key={item.n}>
                <span className={item.done ? "done" : ""}>
                  {item.done ? <Check size={14} /> : item.n}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
            <Link
              to={isTeacher ? "/app/reports" : "/app/roadmap"}
              className="btn secondary full"
            >
              {isTeacher ? "학습 리포트 살펴보기" : "나의 배움길 가기"}
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="insight-card">
            <span className="insight-icon">
              <Languages size={23} />
            </span>
            <span className="eyebrow">가나다계단의 배움 이야기</span>
            <h3>
              “한국말을 잘하는데,
              <br />왜 수업이 어려울까요?”
            </h3>
            <p>
              일상의 대화와 교과 학습에 필요한 한국어는 다를 수 있어요. 표면의
              유창함 너머, 학생의 배움을 살펴봐 주세요.
            </p>
            <Link to="/app/about">
              가나다계단의 설계 원칙 보기
              <ArrowUpRight size={15} />
            </Link>
          </section>
          <div className="sample-note">
            <span className="status-dot" /> 이 교실은 합성 예시 데이터로
            구성되어 있어요.
          </div>
        </div>
      </div>
      <div className="bottom-note">
        <span>✦</span> 작은 이해가 모여, 모두의 배움이 됩니다.
      </div>
    </>
  );
}
