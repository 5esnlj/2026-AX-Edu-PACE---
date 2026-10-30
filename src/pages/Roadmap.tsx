import {
  ArrowRight,
  BookOpen,
  Check,
  Flag,
  Languages,
  Sprout,
} from "lucide-react";
import { useState } from "react";
import { api, useResource } from "../api";
import {
  Badge,
  ErrorState,
  Loading,
  Modal,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import { type RoadStep } from "../types";

type RoadmapData = {
  reading_level: number;
  reason: string;
  recommended: string;
  steps: RoadStep[];
};
export function Roadmap() {
  const { data, error, reload } = useResource<RoadmapData>("/roadmap");
  const [active, setActive] = useState<RoadStep | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function complete() {
    if (!active || answer === null) return;
    setBusy(true);
    try {
      const result = await api<{ correct: boolean; message: string }>(
        `/roadmap/${active.id}/complete`,
        { method: "POST", body: JSON.stringify({ answer }) },
      );
      setFeedback(result);
      if (result.correct) reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  const count = data.steps.filter((s) => s.completed).length;
  return (
    <>
      <PageHeading
        eyebrow="작은 배움이 쌓이는 길"
        title="나만의 배움길"
        description="매일 조금씩, 나에게 필요한 한국어와 친해져요."
        action={
          <Badge>
            {count} / {data.steps.length}개 완료
          </Badge>
        }
      />
      <section className="roadmap-banner">
        <div>
          <span className="eyebrow">나의 한국어 정원</span>
          <h2>오늘도 한 뼘 자라요 🌱</h2>
          <p>{data.reason}</p>
          <div className="roadmap-progress">
            <span style={{ width: `${(count / data.steps.length) * 100}%` }} />
          </div>
        </div>
        <div className="growth-plant" aria-hidden="true">
          {count === 4 ? "🌳" : "🌱"}
        </div>
      </section>
      <div className="learning-path">
        {data.steps.map((step, i) => (
          <div
            className={`path-step path-step-${i} ${step.completed ? "completed" : ""}`}
            key={step.id}
          >
            <div className="path-node">
              {step.completed ? (
                <Check size={30} />
              ) : (
                [
                  <Languages size={27} />,
                  <BookOpen size={27} />,
                  <Sprout size={27} />,
                  <Flag size={27} />,
                ][i]
              )}
            </div>
            <div className="panel path-card">
              <div className="section-title">
                <span className="eyebrow">STEP 0{i + 1}</span>
                {data.recommended === step.id && (
                  <Badge tone="orange">여기서 시작해 봐요</Badge>
                )}
                {step.completed && <Badge>완료했어요</Badge>}
              </div>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
              <div className="path-footer">
                <small>예상 {step.minutes}분 · 사회 예제</small>
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setActive(step);
                    setAnswer(null);
                    setFeedback(null);
                  }}
                >
                  {step.completed ? "다시 배워 보기" : "시작하기"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {active && (
        <Modal title={active.title} onClose={() => setActive(null)}>
          <p className="exercise-question">{active.prompt}</p>
          <div className="answer-options">
            {active.options.map((o, i) => (
              <label key={o} className={answer === i ? "selected" : ""}>
                <input
                  type="radio"
                  name="exercise"
                  checked={answer === i}
                  disabled={feedback?.correct}
                  onChange={() => {
                    setAnswer(i);
                    setFeedback(null);
                  }}
                />
                <span>{i + 1}</span>
                {o}
              </label>
            ))}
          </div>
          {feedback && (
            <Notice tone={feedback.correct ? "positive" : ""}>
              {feedback.message}
            </Notice>
          )}
          <button
            className="btn full"
            disabled={answer === null || busy}
            onClick={() =>
              feedback?.correct ? setActive(null) : void complete()
            }
          >
            {feedback?.correct ? "배움길로 돌아가기" : "답 확인하기"}
          </button>
        </Modal>
      )}
    </>
  );
}
