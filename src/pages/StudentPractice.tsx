import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, useAgentHealth, useResource } from "../api";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
} from "../components";
import type { Material } from "../types";
import type {
  StudentAttempt,
  StudentMaterial,
  StudentQuestion,
} from "../student-materials";
import { StudentAssessment } from "./StudentAssessment";
import "../student-materials.css";
import "../student-practice.css";

type SourceKind = "material" | "student_material" | "text";
type QuestionType = "true_false" | "multiple_choice_4";
type Practice = {
  id: string;
  title: string;
  source_kind: SourceKind;
  source_id: string | null;
  question_type: QuestionType;
  provider: string;
  notice: string;
  created_at: string;
  quiz: { items: StudentQuestion[]; answer_visibility: "after_submission" };
  attempt: StudentAttempt | null;
};
const formatLabel = (format: QuestionType) =>
  format === "true_false" ? "T/F (O/X)" : "4지선다";

export function StudentPracticeGenerator({
  sourceKind,
  sourceId,
  title,
}: {
  sourceKind?: "material" | "student_material";
  sourceId?: string;
  title?: string;
}) {
  const fixed = !!sourceKind && !!sourceId;
  const navigate = useNavigate();
  const {
    data: health,
    error: healthError,
    reload: reloadHealth,
  } = useAgentHealth();
  const classes = useResource<Material[]>(fixed ? null : "/materials");
  const own = useResource<StudentMaterial[]>(
    fixed ? null : "/student-materials",
  );
  const [mode, setMode] = useState<"saved" | "text">("saved");
  const [selection, setSelection] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [format, setFormat] = useState<QuestionType>("true_false");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready =
    fixed || (mode === "text" ? sourceText.trim().length >= 20 : !!selection);
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || !ready) return;
    setBusy(true);
    setError("");
    const [selectedKind, ...selectedId] = selection.split(":");
    const source = fixed
      ? { source_kind: sourceKind, source_id: sourceId }
      : mode === "text"
        ? {
            source_kind: "text",
            title: textTitle.trim() || "나의 학습자료 문제",
            source_text: sourceText.trim(),
          }
        : { source_kind: selectedKind, source_id: selectedId.join(":") };
    try {
      const result = await api<Practice>("/student-practice", {
        method: "POST",
        body: JSON.stringify({
          ...source,
          question_type: format,
          learning_completed: true,
          opt_in: true,
        }),
      });
      navigate(`/app/practice/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel practice-generator"
      aria-label="학습자료 기반 문제 생성"
    >
      <div className="section-title">
        <h2>
          <Sparkles size={21} />
          학습자료로 문제 만들기
        </h2>
        <Badge tone="blue">T/F · 4지선다</Badge>
      </div>
      <p>
        배운 자료에서 최대 3문제를 만들어요. 한국어 진단을 아직 하지 않았어도
        사용할 수 있어요.
      </p>
      {healthError ? (
        <ErrorState message={healthError} retry={reloadHealth} />
      ) : (
        health && (
          <Notice>
            {health.provider === "solar"
              ? health.configured
                ? "Solar AI가 선택한 자료로 문제를 만들어요. 자료와 필요한 학습 정보가 AI 서비스로 전달되며 API 사용료가 발생할 수 있어요."
                : "Solar API 키가 설정되지 않았어요. 선생님이나 운영자에게 연결 설정을 요청해 주세요."
              : "현재 규칙 기반 데모예요. AI가 새 문제를 만드는 기능은 Solar 연결 후 사용할 수 있어요."}
          </Notice>
        )
      )}
      <form onSubmit={generate}>
        {fixed ? (
          <p className="practice-source-name">
            <strong>문제를 만들 자료:</strong> {title || "현재 학습 자료"}
          </p>
        ) : (
          <>
            <fieldset className="practice-options">
              <legend>학습자료 입력 방식</legend>
              <label>
                <input
                  type="radio"
                  name="practice-source-mode"
                  checked={mode === "saved"}
                  disabled={busy}
                  onChange={() => {
                    setMode("saved");
                    setConfirmed(false);
                  }}
                />
                저장된 자료 선택
              </label>
              <label>
                <input
                  type="radio"
                  name="practice-source-mode"
                  checked={mode === "text"}
                  disabled={busy}
                  onChange={() => {
                    setMode("text");
                    setConfirmed(false);
                  }}
                />
                글 직접 붙여넣기
              </label>
            </fieldset>
            {mode === "saved" ? (
              <>
                {(classes.error || own.error) && (
                  <ErrorState
                    message={classes.error || own.error}
                    retry={() => {
                      classes.reload();
                      own.reload();
                    }}
                  />
                )}
                <label className="field">
                  학습자료 선택
                  <select
                    value={selection}
                    disabled={busy}
                    required
                    onChange={(e) => {
                      setSelection(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">문제를 만들 자료를 골라 주세요</option>
                    <optgroup label="선생님이 보내 준 자료">
                      {classes.data?.map((m) => (
                        <option key={m.id} value={`material:${m.id}`}>
                          {m.title}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="내가 만든 학습 자료">
                      {own.data?.map((m) => (
                        <option key={m.id} value={`student_material:${m.id}`}>
                          {m.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                {!classes.loading &&
                  !own.loading &&
                  !classes.data?.length &&
                  !own.data?.length && (
                    <p className="muted">
                      저장된 자료가 없다면 ‘글 직접 붙여넣기’를 선택해 주세요.
                    </p>
                  )}
              </>
            ) : (
              <>
                <label className="field">
                  문제 제목 (선택)
                  <input
                    value={textTitle}
                    maxLength={120}
                    disabled={busy}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="예: 민사 재판 복습 문제"
                  />
                </label>
                <label className="field">
                  학습자료 내용
                  <textarea
                    rows={8}
                    minLength={20}
                    maxLength={40000}
                    required
                    value={sourceText}
                    disabled={busy}
                    onChange={(e) => {
                      setSourceText(e.target.value);
                      setConfirmed(false);
                    }}
                    placeholder="배운 내용을 20자 이상 붙여 넣어 주세요."
                  />
                  <small>{sourceText.length.toLocaleString()} / 40,000자</small>
                </label>
              </>
            )}
          </>
        )}
        <fieldset className="practice-options">
          <legend>문제 형식</legend>
          <label>
            <input
              type="radio"
              name="practice-question-format"
              checked={format === "true_false"}
              disabled={busy}
              onChange={() => setFormat("true_false")}
            />
            T/F (O/X)
          </label>
          <label>
            <input
              type="radio"
              name="practice-question-format"
              checked={format === "multiple_choice_4"}
              disabled={busy}
              onChange={() => setFormat("multiple_choice_4")}
            />
            4지선다
          </label>
        </fieldset>
        <label className="student-opt-in">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          자료를 읽었고 문제를 풀어 볼래요
        </label>
        {error && (
          <div role="alert">
            <Notice>{error}</Notice>
          </div>
        )}
        <button
          className="btn"
          disabled={
            busy ||
            !ready ||
            !confirmed ||
            !health ||
            !!healthError ||
            (health.provider === "solar" && !health.configured)
          }
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Sparkles size={18} />
          )}
          {busy ? "자료에서 문제를 만들고 있어요…" : "AI 문제 만들기"}
        </button>
      </form>
    </section>
  );
}

export function CreateStudentPractice() {
  return (
    <>
      <Link className="back-link" to="/app/quizzes">
        <ArrowLeft size={16} />
        이해 확인
      </Link>
      <PageHeading
        eyebrow="내가 고르는 배움 확인"
        title="AI 문제 만들기"
        description="학습자료를 고르고 T/F 또는 4지선다 문제를 만들어 보세요."
      />
      <StudentPracticeGenerator />
    </>
  );
}

export function StudentPracticeList() {
  const { data, error, reload } = useResource<Practice[]>("/student-practice");
  return (
    <section className="student-material-section" aria-label="내가 만든 문제">
      <h2>내가 만든 문제</h2>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : !data ? (
        <Loading />
      ) : !data.length ? (
        <Empty
          title="배운 자료로 문제를 만들어 볼까요?"
          description="진단 결과가 없어도 자료만 있으면 시작할 수 있어요."
          action={
            <Link className="btn secondary" to="/app/practice/create">
              첫 문제 만들기
              <ArrowRight size={17} />
            </Link>
          }
        />
      ) : (
        <div className="quiz-list">
          {data.map((p) => (
            <section className="panel quiz-card" key={p.id}>
              <div className="quiz-icon">
                <ClipboardCheck size={26} />
              </div>
              <div>
                <Badge tone={p.attempt ? "green" : "blue"}>
                  {p.attempt ? "풀이 완료" : "풀어 볼까요?"}
                </Badge>
                <h3>{p.title}</h3>
                <p>
                  {formatLabel(p.question_type)} · {p.quiz.items.length}문항 ·{" "}
                  {p.provider === "solar" ? "Solar AI" : "규칙 기반 데모"}
                </p>
                {p.attempt && (
                  <small>
                    {p.attempt.score} / {p.attempt.total}문항
                  </small>
                )}
              </div>
              <Link className="btn secondary" to={`/app/practice/${p.id}`}>
                {p.attempt ? "결과 보기" : "문제 풀기"}
                <ArrowRight size={17} />
              </Link>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export function StudentPracticePage() {
  const { id } = useParams();
  const { data, error, reload } = useResource<Practice>(
    `/student-practice/${id}`,
  );
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  return <PracticeReader key={data.id} initial={data} />;
}
function PracticeReader({ initial }: { initial: Practice }) {
  const [practice, setPractice] = useState(initial);
  return (
    <>
      <Link className="back-link" to="/app/quizzes">
        <ArrowLeft size={16} />
        이해 확인 목록
      </Link>
      <PageHeading
        eyebrow={`${formatLabel(practice.question_type)} · ${practice.quiz.items.length}문항`}
        title={practice.title}
        description="자료에서 배운 내용을 떠올려 보세요. 정답과 해설은 제출한 뒤에 볼 수 있어요."
      />
      <Badge tone={practice.provider === "solar" ? "blue" : "orange"}>
        {practice.provider === "solar"
          ? "Solar AI 문제"
          : "규칙 기반 데모 문제"}
      </Badge>
      <Notice>{practice.notice}</Notice>
      <StudentAssessment
        items={practice.quiz.items}
        result={practice.attempt}
        submitPath={`/student-practice/${practice.id}/submit`}
        onResult={(attempt) => setPractice((p) => ({ ...p, attempt }))}
      />
      <Link className="btn secondary" to="/app/practice/create">
        다른 문제 만들기
        <ArrowRight size={17} />
      </Link>
    </>
  );
}
