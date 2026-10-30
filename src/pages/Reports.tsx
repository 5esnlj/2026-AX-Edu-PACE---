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
import { languages, levelNames, skillLabels, type Report } from "../types";

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
                {student.diagnostic_source === "self"
                  ? "자가 점검 값"
                  : "합성 예시 값"}
              </Badge>
            </div>
            <div className="report-summary">
              <div>
                <small>생활 한국어</small>
                <strong>
                  {student.everyday}
                  <span>단계</span>
                </strong>
              </div>
              <div>
                <small>학습 한국어 평균</small>
                <strong>
                  {student.academic}
                  <span>단계</span>
                </strong>
              </div>
              <div>
                <small>배움길 완료</small>
                <strong>
                  {report.completed_steps}
                  <span>/ 4개</span>
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
            <div className="skills-grid">
              {Object.entries(student.levels).map(([key, value]) => (
                <div key={key}>
                  <div>
                    <span>{skillLabels[key as keyof typeof skillLabels]}</span>
                    <strong>{value}단계</strong>
                  </div>
                  <div className="skill-meter">
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className={n <= value ? "filled" : ""} />
                    ))}
                  </div>
                  <small>{levelNames[value - 1]}</small>
                </div>
              ))}
            </div>
            <p className="panel-footnote">
              영역 평균은 현황을 보기 위한 단순 평균입니다. 언어·개념 어려움은
              아래 응답 근거로 별도 살펴봅니다.
            </p>
          </section>
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
                <div className="comparison">
                  <div>
                    <span>일반 문장 문항</span>
                    <strong>
                      {attempt.standard} <small>/ 2개 정답</small>
                    </strong>
                    <div className="bar">
                      <span style={{ width: `${attempt.standard * 50}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>언어 부담을 낮춘 상황 문항</span>
                    <strong>
                      {attempt.reduced} <small>/ 2개 정답</small>
                    </strong>
                    <div className="bar reduced">
                      <span style={{ width: `${attempt.reduced * 50}%` }} />
                    </div>
                  </div>
                </div>
                <Notice>
                  {attempt.caution} 동일 개념 쌍을 비교하는 데모 규칙이며 문항의
                  동등성·진단 타당도는 검증되지 않았습니다.
                </Notice>
                <details className="evidence">
                  <summary>문항별 응답 근거 보기</summary>
                  {attempt.results.map((r) => (
                    <div key={r.id}>
                      <span>
                        {r.id.toUpperCase()} · {r.concept} ·{" "}
                        {r.load === "standard" ? "일반 문장" : "상황 문항"}
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
