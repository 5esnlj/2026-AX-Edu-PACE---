import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Volume2, Mic, Square, Save, ArrowRight } from "lucide-react";
import { api, useResource } from "../api";
import {
  Notice,
  PageHeading,
  Loading,
  ErrorState,
  useToast,
} from "../components";
import { useSession } from "../session";
import {
  domainNames,
  sixLevels,
  type DiagnosticAttempt,
  type DiagnosticQuestion,
  type DiagnosticResult,
} from "../diagnosis";
import "../diagnosis.css";
const domainIcons: Record<string, string> = {
  listening: "👂",
  reading: "📖",
  writing: "✏️",
  speaking: "💬",
};

export function DiagnosticResults({
  result,
  teacher = false,
}: {
  result: DiagnosticResult;
  teacher?: boolean;
}) {
  const low =
    !teacher &&
    Object.values(result.domains).some(
      (v) => v.level !== null && v.level > 0 && v.level <= 2,
    );
  const details = (
    <>
      <h3>학교에서 쓰는 한국어</h3>
      <div className="diagnosis-layers">
        {Object.entries(result.layers).map(([k, v]) => (
          <div key={k}>
            <strong>{v.label}</strong>
            <p>{v.state}</p>
            {teacher && (
              <small>
                {v.score} / {v.total} ·{" "}
                {v.ratio === null
                  ? "채점 대기"
                  : `${Math.round((v.ratio || 0) * 100)}%`}
                {v.unadministered ? ` · 미실시 ${v.unadministered}` : ""}
              </small>
            )}
          </div>
        ))}
      </div>
      <h3>
        교과별 한국어 <small>짧게 확인한 결과</small>
      </h3>
      <div className="diagnosis-domains">
        {Object.entries(result.subjects).map(([k, v]) => (
          <div key={k}>
            <strong>{k}</strong>
            <p>{teacher ? v.display : v.label}</p>
            {teacher && (
              <small>
                T3 {v.t3 === null ? "대기" : v.t3 ? "●" : "○"} · C(5){" "}
                {v.c5 === null ? "대기" : v.c5 ? "●" : "○"} · C(6){" "}
                {v.c6 === null ? "대기" : v.c6 ? "●" : "○"}
                <br />
                {v.flags?.join(" · ")}
                {v.recheck ? " · 재확인 필요" : ""}
              </small>
            )}
          </div>
        ))}
      </div>
    </>
  );
  return (
    <section className="panel diagnostic-results">
      <h2>{teacher ? "6수준 진단 프로파일" : "나의 한국어 계단"}</h2>
      <p>
        전체:{" "}
        <strong>
          {result.overall_label ||
            (result.overall
              ? sixLevels[result.overall - 1]
              : result.overall === 0
                ? "선생님과 다시 확인해요"
                : "진단 진행 중")}
        </strong>
        {teacher && result.overall ? ` · ${result.overall}수준` : ""}
      </p>
      <div className="diagnosis-domains">
        {Object.entries(result.domains).map(([key, v]) => (
          <div key={key}>
            <strong>
              {domainIcons[key]} {domainNames[key]}
            </strong>
            <div
              className="six-steps"
              aria-label={`${domainNames[key]} ${v.label}`}
            >
              {sixLevels.map((_, i) => (
                <span key={i} className={i < (v.level || 0) ? "filled" : ""} />
              ))}
            </div>
            <p>
              {v.label}
              {v.next_challenge ? " · 다음 단계 도전 중" : ""}
              {teacher && v.level ? ` (${v.display || v.level})` : ""}
            </p>
            {teacher && v.raw && (
              <small>
                {v.raw.join(" · ")}
                {v.correction_level ? ` · 수준 ${v.correction_level} 보정` : ""}
                {v.flags?.length ? ` · ${v.flags.join(", ")}` : ""}
              </small>
            )}
          </div>
        ))}
      </div>
      {low ? (
        <>
          <p>오늘은 한 가지씩 해 봐요. 🌱</p>
          <details className="evidence">
            <summary>선생님과 다른 결과도 살펴보기</summary>
            {details}
          </details>
        </>
      ) : (
        details
      )}
      {teacher && (
        <>
          <p>
            우선 지원 층위: {result.bottleneck || "전체 채점 후 확인"} ·
            생활–교과 한국어 격차:{" "}
            {result.gap === null || result.gap === undefined
              ? "확인 대기"
              : `${result.gap} (${result.gap_label})`}
          </p>
          <p>
            교과 대표 수준: {result.subject_representative ?? "확인 대기"} ·
            층위 역전: {result.layer_inversions?.join(", ") || "없음"}
          </p>
          <ul>
            {result.prescriptions?.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      <small>
        ‘시작’은 출발점, ‘도달’은 계단의 마지막 칸을 뜻해요. 결과는 선생님의
        관찰과 함께 살펴봐요.
      </small>
    </section>
  );
}

export function QuestionContent({
  q,
  teacher = false,
}: {
  q: DiagnosticQuestion;
  teacher?: boolean;
}) {
  const [plays, setPlays] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  function listen() {
    if (!window.speechSynthesis) {
      setUnavailable(true);
      return;
    }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(q.stimulus);
    speech.lang = "ko-KR";
    speech.rate = 0.85;
    speech.onerror = () => setUnavailable(true);
    window.speechSynthesis.speak(speech);
    setPlays((p) => p + 1);
  }
  return (
    <>
      <p className="diagnostic-item-meta">
        {q.id} · {domainNames[q.domain]} · {q.level}수준{" "}
        {sixLevels[q.level - 1]} · {q.topic}
      </p>
      {q.domain === "listening" && !teacher ? (
        <>
          <button
            type="button"
            className="btn secondary small"
            onClick={listen}
            disabled={plays >= 2}
          >
            <Volume2 size={17} />
            지시문 듣기 ({plays}/2)
          </button>
          <small>두 번 들려줘요. 기기의 한국어 음성을 사용합니다.</small>
          {unavailable && (
            <Notice>
              소리를 재생하지 못했어요. 선생님이 교사 진단 화면의 지시문을 두 번
              읽어 주세요.
            </Notice>
          )}
        </>
      ) : (
        <div className="diagnostic-stimulus">{q.stimulus}</div>
      )}
      {q.visuals && (
        <div className="diagnostic-visuals">
          {q.visuals.map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
      )}
      {q.table && (
        <div className="diagnostic-table">
          <table>
            <tbody>
              {q.table.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    i === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.asset_note && <small>{q.asset_note}</small>}
      <h3>{q.prompt}</h3>
    </>
  );
}

export function Diagnostic() {
  const resource = useResource<DiagnosticAttempt | null>("/diagnostic");
  const { refresh } = useSession();
  const toast = useToast();
  const [attempt, setAttempt] = useState<DiagnosticAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [text, setText] = useState("");
  const [inPerson, setInPerson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (resource.data !== undefined) load(resource.data);
  }, [resource.data]);
  useEffect(
    () => () => {
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      tracks.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  function load(value: DiagnosticAttempt | null) {
    setAttempt(value);
    setAnswers(value?.draft?.answers || {});
    setText(value?.draft?.text || "");
    setInPerson(value?.draft?.in_person || false);
  }
  const q = attempt?.questions[0];
  const objective =
    attempt?.stage === "listening" || attempt?.stage === "reading";
  async function begin() {
    setBusy(true);
    try {
      load(
        await api<DiagnosticAttempt>("/diagnostic/start", { method: "POST" }),
      );
      window.scrollTo(0, 0);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function save(submit: boolean) {
    if (!attempt) return;
    setBusy(true);
    try {
      const payload = {
        stage: attempt.stage,
        question_id: objective ? null : q?.id,
        answers: objective ? answers : {},
        text,
        in_person: inPerson,
      };
      if (submit) {
        const value = await api<DiagnosticAttempt>(
          `/diagnostic/${attempt.id}/submit`,
          { method: "POST", body: JSON.stringify(payload) },
        );
        load(value);
        window.scrollTo(0, 0);
        await refresh();
        toast("응답을 저장했어요.");
      } else {
        await api(`/diagnostic/${attempt.id}/draft`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast("임시저장했어요. 다시 열어 이어 할 수 있어요.");
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: Blob) {
    if (!file || !attempt || !q) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file, "recording");
      await api(`/diagnostic/${attempt.id}/audio/${q.id}`, {
        method: "POST",
        body,
      });
      setAttempt({
        ...attempt,
        audio: {
          ...attempt.audio,
          [q.id]: `/api/diagnostic/${attempt.id}/audio/${q.id}?t=${Date.now()}`,
        },
      });
      toast("말하기 녹음을 저장했어요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "이 브라우저에서는 녹음을 지원하지 않아요. 음성 파일을 올리거나 대면 말하기를 선택해 주세요.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tracks.current = stream;
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void upload(new Blob(chunks, { type: rec.mimeType }));
      };
      rec.start();
      setRecording(true);
      recordingTimer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 180000);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  if (resource.error)
    return <ErrorState message={resource.error} retry={resource.reload} />;
  if (resource.loading) return <Loading />;
  return (
    <>
      <PageHeading
        eyebrow="6수준으로 알아보는 나의 출발점"
        title="한국어 자가 점검"
        description="듣고, 읽고, 쓰고, 말하며 나에게 필요한 도움을 찾아요."
      />
      <div className="six-level-key">
        {sixLevels.map((l, i) => (
          <span key={l}>
            {i + 1} {l}
          </span>
        ))}
      </div>
      <Notice>
        듣기 12문항 → 읽기 12문항 → 쓰기 최대 6과제 → 말하기 최대 6과제
        순서예요. 쓰기·말하기는 한 과제를 제출하고 선생님의 채점을 기다려요. 두
        수준을 연속해서 통과하지 못하면 다음 영역으로 넘어가요. 임시저장하면
        이어 할 수 있어요.
      </Notice>
      {attempt?.source && (
        <Notice>
          첨부 자료에서 가져온 학생 예시의 진단 결과예요. 새 진단도 시작할 수
          있어요.
        </Notice>
      )}
      {!attempt ? (
        <section className="panel diagnostic-start">
          <h2>나에게 맞는 배움길의 시작</h2>
          <p>듣기부터 차근차근 해 봐요. 새 진단으로 출발점을 확인해요.</p>
          <button className="btn" disabled={busy} onClick={begin}>
            6수준 진단 시작하기 <ArrowRight size={17} />
          </button>
        </section>
      ) : (
        <>
          <div className="diagnostic-progress">
            {["listening", "reading", "writing", "speaking"].map((d) => (
              <span key={d} className={attempt.stage === d ? "current" : ""}>
                {domainNames[d]} {attempt.finished.includes(d) ? "✓" : ""}
              </span>
            ))}
          </div>
          {attempt.stage === "complete" ? (
            <section className="panel">
              <h2>나의 출발점을 기록했어요!</h2>
              <Link className="btn" to="/app/roadmap">
                나의 배움길 보기
              </Link>
              <button className="btn secondary" onClick={begin} disabled={busy}>
                새 진단 시작하기
              </button>
            </section>
          ) : attempt.pending ? (
            <section className="panel">
              <h2>선생님의 채점을 기다리고 있어요</h2>
              <p>
                {attempt.pending} 응답을 저장했어요. 채점이 끝나면 다음 과제를
                할 수 있어요.
              </p>
              <button className="btn secondary" onClick={resource.reload}>
                채점 결과 새로고침
              </button>
              <Link className="text-link" to="/app/roadmap">
                현재 결과로 배움길 보기
              </Link>
            </section>
          ) : (
            <fieldset className="diagnostic-form" disabled={busy || recording}>
              {objective
                ? attempt.questions.map((question) => (
                    <section
                      className="panel diagnostic-question"
                      key={question.id}
                    >
                      <QuestionContent key={question.id} q={question} />
                      <div className="diagnostic-choices">
                        {question.options?.map((o, i) => (
                          <label key={i}>
                            <input
                              type="radio"
                              name={question.id}
                              checked={answers[question.id] === i}
                              onChange={() =>
                                setAnswers({ ...answers, [question.id]: i })
                              }
                            />
                            {question.option_visuals?.[i] && (
                              <span
                                className="choice-pictogram"
                                aria-hidden="true"
                              >
                                {question.option_visuals[i]}
                              </span>
                            )}
                            <span>
                              {i + 1}. {o}
                            </span>
                          </label>
                        ))}
                        <label>
                          <input
                            type="radio"
                            name={question.id}
                            checked={answers[question.id] === null}
                            onChange={() =>
                              setAnswers({ ...answers, [question.id]: null })
                            }
                          />
                          아직 모르겠어요 (무응답)
                        </label>
                      </div>
                    </section>
                  ))
                : q && (
                    <section className="panel diagnostic-question">
                      <QuestionContent key={q.id} q={q} />
                      {attempt.stage === "writing" ? (
                        <label className="field">
                          나의 쓰기 응답
                          <textarea
                            rows={8}
                            maxLength={8000}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                          />
                        </label>
                      ) : (
                        <>
                          <button
                            className="btn secondary"
                            onClick={startRecording}
                            type="button"
                          >
                            <Mic size={17} />
                            말하기 녹음 시작
                          </button>
                          <p>최대 3분 · 녹음은 나와 선생님만 들을 수 있어요.</p>
                          <label className="field">
                            또는 음성 파일 올리기 (12MB 이하)
                            <input
                              type="file"
                              accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,.m4a"
                              onChange={(e) => {
                                void upload(e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {attempt.audio[q.id] && (
                            <audio controls src={attempt.audio[q.id]} />
                          )}
                          <label className="checkbox-line">
                            <input
                              type="checkbox"
                              checked={inPerson}
                              onChange={(e) => setInPerson(e.target.checked)}
                            />
                            녹음 대신 선생님 앞에서 말할게요
                          </label>
                          <label className="field">
                            선생님께 전할 말 (선택)
                            <textarea
                              value={text}
                              maxLength={8000}
                              onChange={(e) => setText(e.target.value)}
                            />
                          </label>
                        </>
                      )}
                    </section>
                  )}
              <div className="diagnostic-actions">
                <button className="btn secondary" onClick={() => save(false)}>
                  <Save size={16} />
                  임시저장
                </button>
                <button
                  className="btn"
                  disabled={objective && Object.keys(answers).length !== 12}
                  onClick={() => save(true)}
                >
                  {objective
                    ? `${domainNames[attempt.stage]} 응답 제출`
                    : "선생님께 과제 제출"}
                </button>
              </div>
            </fieldset>
          )}
          {recording && (
            <button className="btn" onClick={() => recorder.current?.stop()}>
              <Square size={16} />
              녹음 중지 및 저장
            </button>
          )}
          <DiagnosticResults result={attempt.result} />
        </>
      )}
      <p className="muted">
        첨부 설계안의 문항과 기준을 사용합니다. 그림 자리에는 그림 기호와 표를
        제공하며, 표준화 검사를 대신하지 않습니다.
      </p>
    </>
  );
}
