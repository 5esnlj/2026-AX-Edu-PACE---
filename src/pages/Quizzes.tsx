import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, useResource } from "../api";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import { useSession } from "../session";
import type { Attempt, Quiz, QuizDetail } from "../types";

export function Quizzes() {
  const { user } = useSession();
  const { data, error, reload } = useResource<Quiz[]>("/quizzes");
  if (error) return <ErrorState message={error} retry={reload} />;
  return (
    <>
      <PageHeading
        eyebrow="함께 확인하는 배움"
        title="이해 확인"
        description={
          user!.role === "teacher"
            ? "배포한 자료의 이해 확인 문항을 살펴보세요. 학생 응답은 학습 리포트로 연결됩니다."
            : "어떤 내용을 이해했는지, 어떤 도움이 더 필요한지 함께 알아봐요."
        }
      />
      <Notice>
        <strong>공정한 이해 확인</strong> · 정답 단서가 되는 번역·교과어
        풀이·해설은 제출 전에 제공하지 않습니다. 현재는 사회 정치 단원 4문항
        데모입니다.
      </Notice>
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty
          title="아직 이해 확인 문항이 없어요"
          description="교사가 자료를 배포하고 문항을 만들면 여기에 나타나요."
        />
      ) : (
        <div className="quiz-list">
          {data.map((q) => (
            <section className="panel quiz-card" key={q.id}>
              <div className="quiz-icon">
                <ClipboardCheck size={28} />
              </div>
              <div>
                <Badge tone={q.attempt ? "green" : "blue"}>
                  {q.attempt
                    ? q.attempt.is_sample
                      ? "예시 풀이 기록"
                      : "풀이 완료"
                    : "함께 확인해요"}
                </Badge>
                <h2>{q.title}</h2>
                <p>
                  {q.question_count}문항 · 일반 문장 + 언어 부담을 낮춘 상황
                  문항
                </p>
                {q.attempt && (
                  <small>
                    최근 응답 {q.attempt.score} / {q.attempt.total} ·{" "}
                    {q.attempt.label}
                  </small>
                )}
              </div>
              <Link to={`/app/quizzes/${q.id}`} className="btn secondary">
                {user!.role === "teacher"
                  ? "문항 미리보기"
                  : q.attempt
                    ? "다시 풀어 보기"
                    : "시작하기"}
                <ArrowRight size={17} />
              </Link>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export function QuizPage() {
  const { id } = useParams();
  const { data, error, reload } = useResource<QuizDetail>(`/quizzes/${id}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  return <QuizForm key={data.id} quiz={data} />;
}
function QuizForm({ quiz }: { quiz: QuizDetail }) {
  const { user } = useSession();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit() {
    setBusy(true);
    try {
      setResult(
        await api<Attempt>(`/quizzes/${quiz.id}/submit`, {
          method: "POST",
          body: JSON.stringify({ answers }),
        }),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/app/quizzes">
        <ArrowLeft size={16} />
        이해 확인 목록
      </Link>
      <PageHeading
        eyebrow={
          user!.role === "teacher"
            ? "교사용 미리보기"
            : "배운 내용을 떠올려 봐요"
        }
        title={quiz.title}
        description="자료에서 배운 개념을 서로 다른 문장과 상황에서 확인해요."
      />
      {result ? (
        <>
          <section className="quiz-result">
            <div className="result-flower">✿</div>
            <Badge>끝까지 함께했어요</Badge>
            <h2>
              {result.score === result.total
                ? "잘 이해했어요!"
                : "오늘의 배움, 잘 마쳤어요!"}
            </h2>
            <div className="result-score">
              {result.score}
              <small>/ {result.total}개</small>
            </div>
            <p>{result.label}</p>
            <p>{result.recommendation}</p>
            <Link className="btn" to="/app/roadmap">
              다음 배움으로 이어가기
              <ArrowRight size={17} />
            </Link>
          </section>
          <Notice>{result.caution}</Notice>
        </>
      ) : (
        <Notice>
          <ShieldCheck size={16} />
          {quiz.fairness}
        </Notice>
      )}
      <div className="quiz-questions">
        {quiz.questions.map((q, index) => {
          const feedback = result?.results.find((r) => r.id === q.id);
          return (
            <fieldset
              className={`panel quiz-question ${feedback ? (feedback.correct ? "correct" : "incorrect") : ""}`}
              key={q.id}
            >
              <legend>
                <span className="question-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {feedback && (
                  <Badge tone={feedback.correct ? "green" : "orange"}>
                    {feedback.correct ? "잘 이해했어요" : "다시 배워 봐요"}
                  </Badge>
                )}
              </legend>
              <h2>{q.prompt}</h2>
              <div className="answer-options">
                {q.options.map((o, i) => (
                  <label
                    key={i}
                    className={`${answers[q.id] === i ? "selected" : ""} ${feedback?.answer === i ? "right-answer" : ""}`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === i}
                      disabled={!!result || user!.role === "teacher"}
                      onChange={() => setAnswers({ ...answers, [q.id]: i })}
                    />
                    <span>
                      {feedback?.answer === i ? <Check size={16} /> : i + 1}
                    </span>
                    {o}
                  </label>
                ))}
              </div>
              {feedback && (
                <div className="question-explanation">
                  <strong>함께 알아봐요</strong>
                  <p>{feedback.explanation}</p>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      {!result && user!.role === "student" && (
        <div className="quiz-submit">
          <span>
            {Object.keys(answers).length} / {quiz.questions.length}문항 응답
          </span>
          <button
            className="btn"
            disabled={
              busy || Object.keys(answers).length !== quiz.questions.length
            }
            onClick={submit}
          >
            {busy ? "배움 기록 저장 중…" : "답 제출하고 함께 확인하기"}
            <ArrowRight size={17} />
          </button>
        </div>
      )}
      {user!.role === "teacher" && (
        <Notice>
          교사 미리보기입니다. 데모 문항은 전문가 검수된 평가 도구가 아닙니다.
          실제 학생에게 사용하기 전 문항과 평가 공정성을 검토해 주세요.
        </Notice>
      )}
    </>
  );
}
