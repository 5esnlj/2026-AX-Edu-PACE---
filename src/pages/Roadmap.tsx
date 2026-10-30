import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { api, useResource, useAgentHealth } from "../api";
import {
  Badge,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import type { LearningPath } from "../diagnosis";
import { DiagnosticResults } from "./Diagnostic";

export function PathCards({
  path,
  teacher = false,
  onSaved,
}: {
  path: LearningPath;
  teacher?: boolean;
  onSaved?: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const toast = useToast();
  async function save(step: string) {
    setBusy(step);
    try {
      await api(`/roadmap/${path.id}/steps/${step}`, {
        method: "POST",
        body: JSON.stringify({
          reflection: notes[step] ?? path.progress?.[step]?.reflection ?? "",
        }),
      });
      toast("배움 기록을 저장했어요.");
      onSaved?.();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  const oneGoal =
    !teacher &&
    Object.values(path.profile?.domains || {}).some(
      (v) => v.level !== null && v.level <= 2,
    );
  const next =
    path.roadmap?.find((s) => !path.progress?.[s.id]) || path.roadmap?.at(-1);
  const visible = oneGoal
    ? path.roadmap?.filter((s) => s.id === next?.id)
    : path.roadmap;
  return (
    <div className="personal-path">
      {oneGoal && (
        <Notice>
          오늘은 한 걸음만 해 봐요. 기록을 남기면 다음 걸음이 보여요.
        </Notice>
      )}
      {visible?.map((step) => {
        const i = path.roadmap!.findIndex((s) => s.id === step.id);
        return (
          <section className="panel personal-path-card" key={step.id}>
            <div className="section-title">
              <span className="eyebrow">
                걸음 {i + 1} · {step.period}
              </span>
              {path.progress?.[step.id] && (
                <Badge>
                  <Check size={14} />
                  활동 기록 완료
                </Badge>
              )}
            </div>
            <h2>{step.focus}</h2>
            <ul>
              {step.activities.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p className="path-check">
              <strong>함께 확인해요</strong> {step.check_for_progress}
            </p>
            <details className="evidence">
              <summary>이 활동을 제안한 이유</summary>
              <ul>
                {step.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
            {teacher ? (
              <p className="diagnostic-stimulus">
                학생의 배움 기록:{" "}
                {path.progress?.[step.id]?.reflection ||
                  "아직 기록하지 않았어요."}
              </p>
            ) : (
              <>
                <label className="field">
                  걸음 {i + 1} 배움 기록
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="해 본 활동이나 도움이 필요한 점을 적어요."
                    value={
                      notes[step.id] ??
                      path.progress?.[step.id]?.reflection ??
                      ""
                    }
                    onChange={(e) =>
                      setNotes({ ...notes, [step.id]: e.target.value })
                    }
                  />
                </label>
                <button
                  className="btn secondary"
                  disabled={
                    !!busy ||
                    !(
                      notes[step.id] ??
                      path.progress?.[step.id]?.reflection ??
                      ""
                    ).trim()
                  }
                  onClick={() => save(step.id)}
                >
                  {busy === step.id ? "저장하고 있어요…" : "활동 기록 저장"}
                </button>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function Roadmap() {
  const resource = useResource<LearningPath>("/roadmap");
  const { data: health } = useAgentHealth();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function generate() {
    setBusy(true);
    try {
      await api("/roadmap/generate", { method: "POST" });
      resource.reload();
      toast("현재 진단에 맞춘 배움길을 만들었어요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (resource.error)
    return <ErrorState message={resource.error} retry={resource.reload} />;
  const path = resource.data;
  if (!path) return <Loading />;
  return (
    <>
      <PageHeading
        eyebrow="나의 출발점에서 한 걸음씩"
        title="나의 배움길"
        description="6수준 진단에서 확인한 강점과 필요한 도움을 학습 활동으로 이어 가요."
      />
      {path.needs_diagnostic ? (
        <section className="panel diagnostic-start">
          <h2>먼저 나의 출발점을 알아봐요</h2>
          <p>{path.message}</p>
          <Link className="btn" to="/app/diagnostic">
            한국어 자가 점검 시작 <ArrowRight size={17} />
          </Link>
        </section>
      ) : (
        <>
          <section className="roadmap-banner">
            <div>
              <span className="eyebrow">나에게 맞는 작은 목표</span>
              <h2>오늘도 한 계단, 함께 올라요 🌱</h2>
              <p>{path.student_summary}</p>
              <Badge>
                {Object.keys(path.progress || {}).length} /{" "}
                {path.roadmap?.length}개 활동 기록
              </Badge>
            </div>
          </section>
          {path.provisional && (
            <Notice>
              진단 중간 결과로 만든 임시 배움길이에요. 쓰기·말하기 채점까지
              마치면 전체 결과로 다시 제안해요.{" "}
              <Link to="/app/diagnostic">진단 이어하기</Link>
            </Notice>
          )}
          <div className="path-generation">
            <div>
              <strong>
                {path.provider === "solar"
                  ? "Solar가 제안한 학습 활동"
                  : "진단 규칙으로 제안한 학습 활동"}
              </strong>
              <p>
                기간과 활동은 조정할 수 있어요. 새로 만들면 새 활동 기록을
                시작해요.
              </p>
            </div>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={generate}
            >
              <Sparkles size={17} />
              {busy
                ? "배움길을 만들고 있어요…"
                : health?.provider === "solar"
                  ? "Solar로 배움길 만들기"
                  : "현재 결과로 다시 만들기"}
            </button>
          </div>
          <PathCards key={path.id} path={path} onSaved={resource.reload} />
          <Notice>{path.check_in}</Notice>
          {path.profile && <DiagnosticResults result={path.profile} />}
          <Link className="text-link" to="/app/diagnostic">
            한국어 자가 점검으로 돌아가기 <ArrowRight size={15} />
          </Link>
        </>
      )}
    </>
  );
}
