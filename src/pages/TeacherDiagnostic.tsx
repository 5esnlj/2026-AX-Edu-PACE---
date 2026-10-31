import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, useResource } from "../api";
import {
  Badge,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import type { DiagnosticAttempt, LearningPath } from "../diagnosis";
import type { Student } from "../types";
import { DiagnosticResults, QuestionContent } from "./Diagnostic";
import { PathCards } from "./Roadmap";

type TeacherRecord = {
  student: Student;
  attempt: DiagnosticAttempt | null;
  history: { id: string; created_at: string; stage: string }[];
};
const rubricNames = ["과제 충족", "표적 어휘", "담화 구성", "이해 가능성"];
export function TeacherDiagnostic() {
  const { id } = useParams();
  const record = useResource<TeacherRecord>(`/students/${id}/diagnostic`);
  const path = useResource<LearningPath>(`/students/${id}/roadmap`);
  const [scores, setScores] = useState<string[]>(["", "", "", ""]);
  const [language, setLanguage] = useState("");
  const [concept, setConcept] = useState("");
  const [observation, setObservation] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const attempt = record.data?.attempt;
  const task = attempt?.pending_task;
  useEffect(() => {
    setScores(["", "", "", ""]);
    setLanguage("");
    setConcept("");
    setObservation("");
  }, [task?.id, attempt?.id]);
  async function grade() {
    if (!attempt || !task) return;
    setBusy(true);
    try {
      await api(`/diagnostic/${attempt.id}/grade`, {
        method: "POST",
        body: JSON.stringify({
          question_id: task.id,
          scores: scores.map(Number),
          language_note: language,
          concept_note: concept,
          observation_note: observation,
        }),
      });
      record.reload();
      path.reload();
      toast("채점을 저장했어요. 학생이 다음 과제를 이어 할 수 있어요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (record.error)
    return <ErrorState message={record.error} retry={record.reload} />;
  if (!record.data) return <Loading />;
  const response = task && attempt?.responses[task.id];
  return (
    <>
      <PageHeading
        eyebrow="학생 관리 · 한국어 자가 점검"
        title={`${record.data.student.name}의 6수준 진단`}
        description="듣기·읽기는 문항 결과로, 쓰기·말하기는 교사 채점으로 확인합니다."
        action={
          <Link className="btn secondary" to="/app/students">
            학생 목록
          </Link>
        }
      />
      {attempt?.source && (
        <Notice>
          <strong>{attempt.source.file_name}</strong>
          <p>{attempt.source.description}</p>
          <p>
            문서에 기재된 합계:{" "}
            {Object.entries(attempt.source.reported_totals)
              .map(([q, n]) => `${q} ${n}점`)
              .join(" · ")}
          </p>
          <p>
            문서의 층위 표기:{" "}
            {Object.entries(attempt.source.reported_mastery_stages)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ")}
          </p>
        </Notice>
      )}
      {!attempt ? (
        <Notice>
          아직 새 6수준 진단을 시작하지 않았습니다. 학생 화면의 ‘한국어 자가
          점검’에서 시작해 주세요.
        </Notice>
      ) : (
        <>
          <div className="diagnostic-actions">
            <Badge>
              {attempt.stage === "complete"
                ? "진단 완료"
                : attempt.pending
                  ? "교사 채점 대기"
                  : "학생 응답 중"}
            </Badge>
            <button
              className="btn secondary small"
              onClick={() => {
                record.reload();
                path.reload();
              }}
            >
              학생 응답 새로고침
            </button>
          </div>
          {task && (
            <section className="panel teacher-grading">
              <h2>제출된 과제 채점</h2>
              <QuestionContent key={task.id} q={task} teacher />
              <h3>학생 응답</h3>
              <p className="diagnostic-stimulus">
                {response && typeof response === "object"
                  ? response.text || "(글 응답 없음)"
                  : "응답 없음"}
              </p>
              {attempt.audio[task.id] ? (
                <audio controls src={attempt.audio[task.id]} />
              ) : (
                task.domain === "speaking" && (
                  <Notice>
                    대면 말하기입니다. 직접 관찰한 내용을 아래에 기록해야 채점을
                    저장할 수 있습니다.
                  </Notice>
                )
              )}
              {task.review_note && <Notice>{task.review_note}</Notice>}
              <p>
                각 기준을 0~3점으로 채점해 주세요. R1 ≥ 2점이며 합계 8점
                이상이면 통과(P)입니다. 5·6수준은 R3·R4 각각 2점 이상이어야
                합니다. 교과 개념의 오류는 언어 점수에서 감점하지 않고, 별도
                관찰로 기록합니다.
              </p>
              <fieldset className="diagnostic-form" disabled={busy}>
                <div className="rubric-grid">
                  {rubricNames.map((name, i) => {
                    const code = `R${i + 1}`;
                    return (
                      <label className="field" key={code}>
                        <strong>
                          {code} · {name}
                        </strong>
                        <span>
                          {task.rubric?.[code] ||
                            "발음·조사·어미가 의미 전달을 방해하는지 확인합니다."}
                        </span>
                        <select
                          aria-label={`${code} ${name} 점수`}
                          value={scores[i]}
                          onChange={(e) =>
                            setScores(
                              scores.map((v, n) =>
                                n === i ? e.target.value : v,
                              ),
                            )
                          }
                        >
                          <option value="">점수 선택</option>
                          {attempt.rubric?.[code]?.map((label, n) => (
                            <option key={n} value={n}>
                              {n}점 · {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <label className="field">
                  언어 지원 관찰 (선택)
                  <textarea
                    maxLength={2000}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="어휘·문장·표현에서 필요한 지원"
                  />
                </label>
                <label className="field">
                  개념 이해 관찰 (선택)
                  <textarea
                    maxLength={2000}
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="한국어 표현과 구분해 확인한 개념 이해"
                  />
                </label>
                <label className="field">
                  대면 말하기 관찰 기록{" "}
                  {task.domain === "speaking" && !attempt.audio[task.id]
                    ? "(필수)"
                    : "(선택)"}
                  <textarea
                    maxLength={2000}
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                  />
                </label>
                <button
                  className="btn"
                  disabled={
                    scores.some((s) => s === "") ||
                    (task.domain === "speaking" &&
                      !attempt.audio[task.id] &&
                      !observation.trim())
                  }
                  onClick={grade}
                >
                  {busy ? "저장 중…" : "채점 저장 및 다음 과제 안내"}
                </button>
              </fieldset>
            </section>
          )}
          {!task && attempt.stage !== "complete" && (
            <Notice>
              학생이 응답을 제출하면 이곳에서 채점할 수 있습니다. 수행 과제는
              낮은 수준부터 진행하며, 두 번 연속 P가 아니면 해당 영역을
              종료합니다.
            </Notice>
          )}
          {attempt.stage === "listening" && (
            <details className="panel">
              <summary>듣기 지시문 읽어 주기</summary>
              <p>
                학생의 기기에서 음성이 나오지 않으면 각 지시문을 두 번 읽어
                주세요.
              </p>
              {attempt.questions.map((q) => (
                <section className="diagnostic-question" key={q.id}>
                  <QuestionContent q={q} teacher />
                </section>
              ))}
            </details>
          )}
          <DiagnosticResults result={attempt.result} teacher />
          {Object.keys(attempt.grades || {}).length > 0 && (
            <details className="panel">
              <summary>저장한 수행 과제 채점 기록</summary>
              {Object.entries(attempt.grades || {}).map(([qid, g]) => {
                const grade = g as {
                  scores: number[];
                  language_note: string;
                  concept_note: string;
                  observation_note: string;
                };
                return (
                  <div className="grading-history" key={qid}>
                    <strong>
                      {qid} · R1~R4: {grade.scores.join(" / ")}
                    </strong>
                    <p>언어 지원: {grade.language_note || "기록 없음"}</p>
                    <p>개념 이해: {grade.concept_note || "기록 없음"}</p>
                    {grade.observation_note && (
                      <p>말하기 관찰: {grade.observation_note}</p>
                    )}
                    {attempt.audio[qid] && (
                      <audio controls preload="none" src={attempt.audio[qid]} />
                    )}
                  </div>
                );
              })}
            </details>
          )}
        </>
      )}
      <section>
        <h2>진단에 연결된 배움길</h2>
        {path.error ? (
          <ErrorState message={path.error} retry={path.reload} />
        ) : path.loading ? (
          <Loading />
        ) : path.data?.needs_diagnostic ? (
          <p>{path.data.message}</p>
        ) : (
          path.data && (
            <>
              <p>{path.data.student_summary}</p>
              {path.data.provisional && (
                <Notice>아직 전체 채점 전인 임시 경로입니다.</Notice>
              )}
              <PathCards key={path.data.id} path={path.data} teacher />
            </>
          )
        )}
      </section>
    </>
  );
}
