import { ArrowRight, Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Badge, Notice } from "../components";
import type { StudentAttempt, StudentQuestion } from "../student-materials";

export function StudentAssessment({
  items,
  result,
  submitPath,
  onResult,
}: {
  items: StudentQuestion[];
  result: StudentAttempt | null;
  submitPath: string;
  onResult: (attempt: StudentAttempt) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      onResult(
        await api<StudentAttempt>(submitPath, {
          method: "POST",
          body: JSON.stringify({ answers }),
        }),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="student-assessment">
      <Notice>
        이 자료에서 배운 내용만 확인해요. 문항마다 하나씩 답해 주세요. 한국어
        자가 점검과는 별도의 연습이에요.
      </Notice>
      {result && (
        <section className="quiz-result" role="status">
          <Badge>오늘의 배움을 확인했어요</Badge>
          <h2>이해 확인 완료</h2>
          <div className="result-score">
            {result.score}
            <small> / {result.total}개</small>
          </div>
          <p>{result.notice}</p>
        </section>
      )}
      <div className="quiz-questions">
        {items.map((q, index) => {
          const feedback = result?.results.find((r) => r.id === q.id);
          const choices =
            q.type === "true_false" && !q.choices.length
              ? ["O", "X"]
              : q.choices;
          return (
            <fieldset
              className={`panel quiz-question ${feedback ? (feedback.correct ? "correct" : "incorrect") : ""}`}
              key={q.id}
              aria-labelledby={`prompt-${q.id}`}
              disabled={busy || !!result}
            >
              <legend>
                <span className="question-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {feedback && (
                  <Badge tone={feedback.correct ? "green" : "orange"}>
                    {feedback.correct ? "잘 이해했어요" : "함께 다시 알아봐요"}
                  </Badge>
                )}
              </legend>
              <h2 id={`prompt-${q.id}`}>{q.prompt}</h2>
              {q.type === "short_answer" ? (
                <label className="field">
                  짧은 답 쓰기
                  <input
                    aria-labelledby={`prompt-${q.id}`}
                    maxLength={500}
                    required
                    value={feedback?.selected ?? answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers({ ...answers, [q.id]: e.target.value })
                    }
                  />
                </label>
              ) : (
                <div className="answer-options">
                  {choices.map((choice, i) => (
                    <label
                      key={i}
                      className={`${(feedback?.selected ?? answers[q.id]) === choice ? "selected" : ""} ${feedback?.correct_answer === choice ? "right-answer" : ""}`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={choice}
                        required
                        checked={
                          (feedback?.selected ?? answers[q.id]) === choice
                        }
                        onChange={() =>
                          setAnswers({ ...answers, [q.id]: choice })
                        }
                      />
                      <span>
                        {feedback?.correct_answer === choice ? (
                          <Check size={16} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {choice}
                    </label>
                  ))}
                </div>
              )}
              {feedback && (
                <div className="question-explanation">
                  <strong>정답: {feedback.correct_answer}</strong>
                  <p>{feedback.explanation}</p>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      {error && (
        <div role="alert">
          <Notice>{error}</Notice>
        </div>
      )}
      {!result && (
        <div className="form-actions">
          <p>
            {items.filter((q) => answers[q.id]?.trim()).length} / {items.length}
            문항에 답했어요.
          </p>
          <button
            className="btn"
            disabled={
              busy || !items.length || items.some((q) => !answers[q.id]?.trim())
            }
          >
            {busy ? "답안을 확인하고 있어요…" : "답안 제출"}
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </form>
  );
}
