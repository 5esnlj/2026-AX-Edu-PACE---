import { ArrowRight, ChevronRight, Sprout } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../api";
import {
  Avatar,
  Badge,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  SectionTitle,
} from "../components";
import {
  languages,
  diagnosticSourceLabel,
  studentLevelLabel,
  type Report,
} from "../types";
import { DiagnosticResults } from "./Diagnostic";

export function Reports() {
  const { data, error, reload } = useResource<Report[]>("/reports");
  const [params, setParams] = useSearchParams();
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  const report =
    data.find((r) => r.student.id === params.get("student")) || data[0];
  const { student, attempt } = report;
  return (
    <>
      <PageHeading
        eyebrow="점수 너머의 배움"
        title="학생 학습 리포트"
        description="한국어의 어려움과 개념의 어려움, 근거를 모아 조심스럽게 살펴봐요."
      />
      <div className="report-layout">
        <aside className="panel report-roster">
          <h3>학생 선택</h3>
          {data.map((r, i) => (
            <button
              key={r.student.id}
              className={student.id === r.student.id ? "active" : ""}
              onClick={() => setParams({ student: r.student.id })}
            >
              <Avatar name={r.student.name} index={i} />
              <span>
                <strong>{r.student.name}</strong>
                <small>{languages[r.student.language]}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </aside>
        <div>
          <section className="panel">
            <div className="report-student">
              <Avatar name={student.name} size="large" />
              <div>
                <h2>{student.name}의 배움 기록</h2>
                <p>
                  {student.grade} · {languages[student.language]}
                </p>
              </div>
              <Badge tone="neutral">
                {diagnosticSourceLabel(student.diagnostic_source)}
              </Badge>
            </div>
            <div className="report-summary">
              <div>
                <small>생활 한국어</small>
                <strong>
                  {student.diagnostic_summary?.layers.B.state || "진단 전"}
                </strong>
              </div>
              <div>
                <small>종합 진단</small>
                <strong>{studentLevelLabel(student)}</strong>
              </div>
              <div>
                <small>배움길 완료</small>
                <strong>
                  {report.completed_steps}
                  <span>/ {report.total_steps}개</span>
                </strong>
              </div>
              <div>
                <small>더 배울 단어</small>
                <strong>
                  {report.saved_words}
                  <span>개</span>
                </strong>
              </div>
            </div>
            <Link
              className="btn secondary"
              to={`/app/students/${student.id}/diagnostic`}
            >
              6수준 진단 보기·채점 및 배움길 확인
            </Link>
            <p className="panel-footnote">
              종합 수준은 네 영역의 중앙값과 최저 영역을 함께 반영합니다. 채점
              전에는 확정하지 않습니다.
            </p>
          </section>
          {student.diagnostic_summary && (
            <DiagnosticResults result={student.diagnostic_summary} teacher />
          )}
          <section className="panel">
            <SectionTitle title="이해 확인으로 살펴본 지원 방향" />
            {attempt ? (
              <>
                <div className={`report-signal signal-${attempt.kind}`}>
                  <span className="signal-icon">
                    <Sprout size={27} />
                  </span>
                  <div>
                    <Badge tone={attempt.is_sample ? "neutral" : "green"}>
                      {attempt.is_sample
                        ? "합성 예시 응답"
                        : "실제 데모 풀이 기록"}
                    </Badge>
                    <h3>{attempt.label}</h3>
                    <p>{attempt.recommendation}</p>
                  </div>
                </div>
                {attempt.cause && (
                  <div className="cause-report">
                    <p>{attempt.cause.reason}</p>
                    {attempt.cause.notes.map((n) => (
                      <Notice key={n}>{n}</Notice>
                    ))}
                    {!!attempt.cause.wrong.length && (
                      <div className="cause-list">
                        {attempt.cause.wrong.map((w) => (
                          <div key={w.concept} className="cause-item">
                            <strong>{w.concept}</strong>
                            <Badge
                              tone={
                                w.kind === "language"
                                  ? "orange"
                                  : w.kind === "concept"
                                    ? "purple"
                                    : "neutral"
                              }
                            >
                              {w.label}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {!!attempt.cause.understood.length && (
                      <p className="muted">
                        이해했어요: {attempt.cause.understood.join(", ")}
                      </p>
                    )}
                    <small className="muted">
                      판정 기준: {attempt.cause.subject || "이 교과"} 학습
                      한국어 수준이 {attempt.cause.threshold} 이하이면 한국어
                      어려움, {attempt.cause.threshold + 1} 이상이면 교과 개념
                      어려움으로 봐요. 진단 전이거나 결과가 불확실하면 판정을
                      보류해요.
                    </small>
                  </div>
                )}
                <details className="evidence">
                  <summary>문항별 응답 근거 보기</summary>
                  {attempt.results.map((r) => (
                    <div key={r.id}>
                      <span>
                        {r.id.toUpperCase()} · {r.concept}
                      </span>
                      <Badge tone={r.correct ? "green" : "orange"}>
                        {r.correct ? "정답" : "다시 살펴보기"}
                      </Badge>
                    </div>
                  ))}
                </details>
              </>
            ) : (
              <Empty
                title="아직 응답 근거가 없어요"
                description="학생이 이해 확인 문항을 풀면 지원 방향을 살펴볼 수 있어요. 한국어 수준만으로 개념 이해를 판단하지 않아요."
                action={
                  <Link className="btn secondary" to="/app/quizzes">
                    배포한 문항 확인
                  </Link>
                }
              />
            )}
          </section>
          <div className="next-learning">
            <div>
              <h3>관찰은 다음 수업의 디딤돌이 돼요.</h3>
              <p>학생에게 필요한 설명과 자료를 준비해 보세요.</p>
            </div>
            <Link to="/app/create" className="btn">
              맞춤 자료 만들기
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
