import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useAgentHealth, useResource } from "../api";
import {
  Badge,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  useToast,
} from "../components";
import type { Material, Student } from "../types";
import type {
  ReviewCandidate,
  ReviewCounts,
  TranslationGlossary,
  TranslationReport,
} from "../translation-review";
import { MaterialTools } from "./MaterialTools";

type Form = {
  title: string;
  document_text: string;
  mode: "parallel" | "standalone";
  language: string;
  subject: string;
  unit: string;
  material_id: string | null;
};
type History = {
  id: string;
  title: string;
  created_at: string;
  needs_selection: boolean;
  counts: ReviewCounts;
};

export function TranslationReview() {
  const [query] = useSearchParams();
  const glossary = useResource<TranslationGlossary>(
    "/translation-review/glossary",
  );
  const materials = useResource<Material[]>("/materials");
  const students = useResource<Student[]>("/students");
  const history = useResource<History[]>("/translation-reviews");
  const { data: agent } = useAgentHealth();
  const [selectedMaterial, setSelectedMaterial] = useState(
    query.get("material") || "",
  );
  const [selectedStudent, setSelectedStudent] = useState("");
  const [form, setForm] = useState<Form>({
    title: "수업 자료 오역 검토",
    document_text: "",
    mode: "parallel",
    language: "zh",
    subject: "",
    unit: "",
    material_id: null,
  });
  const [report, setReport] = useState<TranslationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const saved = materials.data?.find((m) => m.id === selectedMaterial);
  const sid = selectedStudent || saved?.targets[0] || "";
  const change = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setReport(null);
  };

  async function extract(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast("10MB 이하의 PDF를 선택해 주세요.", true);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<{ text: string }>(
        "/extract?include_page_markers=true",
        { method: "POST", body },
      );
      change({
        document_text: result.text,
        title: file.name.replace(/\.pdf$/i, "").slice(0, 120),
        material_id: null,
      });
      toast("PDF 텍스트를 가져왔어요. 쪽 표시와 인식 내용을 확인해 주세요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  function loadMaterial() {
    if (!saved || !sid || !glossary.data) return;
    const variant = saved.variants[sid];
    const language = variant.native_language
      ? Object.entries(glossary.data.analysis_languages).find(
          ([, label]) => label === variant.native_language,
        )?.[0]
      : variant.language;
    if (!language || !glossary.data.analysis_languages[language]) {
      toast(
        "이 자료의 언어를 지원하지 않습니다. 지원 언어로 된 자료를 선택해 주세요.",
        true,
      );
      return;
    }
    const text = `한국어 원문\n${saved.source_text}\n\n재구성 글\n${variant.text}\n\n교과어 병기\n${variant.terms
      .filter((t) => t.translation.trim())
      .map((t) => `${t.term}: ${t.translation}`)
      .join("\n")}`;
    if (text.length > 40000) {
      toast(
        "자료가 깁니다. 검토할 부분을 복사해 40,000자 이하로 입력해 주세요.",
        true,
      );
      return;
    }
    change({
      title: `${saved.title} 오역 검토`.slice(0, 120),
      document_text: text,
      language,
      mode: "parallel",
      subject: saved.subject,
      unit: saved.unit,
      material_id: saved.id,
    });
    toast(
      "저장된 글과 교과어 병기를 가져왔어요. 원문 자료는 변경하지 않습니다.",
    );
  }

  async function analyze() {
    setBusy(true);
    setReport(null);
    try {
      const result = await api<TranslationReport>("/translation-reviews", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          subject: form.subject || null,
          unit: form.unit.trim() || null,
        }),
      });
      setReport(result);
      history.reload();
      toast(
        result.result.needs_selection
          ? "교과·단원을 선택한 뒤 다시 분석해 주세요."
          : "오역 검토 기록을 저장했어요.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function openReport(id: string) {
    setBusy(true);
    try {
      const result = await api<TranslationReport>(`/translation-reviews/${id}`);
      setForm({
        title: result.title,
        document_text: result.document_text,
        material_id: result.material_id,
        ...result.parameters,
        subject: result.parameters.subject || "",
        unit: result.parameters.unit || "",
      });
      setReport(result);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  if (glossary.error)
    return <ErrorState message={glossary.error} retry={glossary.reload} />;
  if (!glossary.data) return <Loading />;
  return (
    <>
      <MaterialTools />
      <PageHeading
        eyebrow="우리 반 수업 자료 · Level 2"
        title="수업 자료 오역 탐지"
        description="번역한 수업 자료를 참고 대역표와 문맥에 비추어 검토해요. 결과는 교사에게만 보여요."
      />
      <Notice>
        {agent?.provider === "solar"
          ? "Solar가 문맥과 근거를 분석합니다. 검토 본문과 참고 대역표가 Upstage로 전송되며 API 사용료가 발생할 수 있습니다."
          : "현재는 데모 모드입니다. 명시적인 ‘한국어: 번역’ 병기만 비교하며, 맥락 분석은 Solar 설정이 필요합니다."}
      </Notice>
      <div className="l2-layout">
        <section className="panel">
          <h2>검토할 자료</h2>
          <fieldset className="l2-form" disabled={busy}>
            <label className="field">
              <span>검토 제목</span>
              <input
                value={form.title}
                maxLength={120}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <details open={!!query.get("material")} className="l2-import">
              <summary>기존 수업 자료에서 가져오기</summary>
              {materials.error ? (
                <p>{materials.error}</p>
              ) : (
                <>
                  <label className="field">
                    <span>저장된 수업 자료</span>
                    <select
                      value={selectedMaterial}
                      onChange={(e) => {
                        setSelectedMaterial(e.target.value);
                        setSelectedStudent("");
                      }}
                    >
                      <option value="">자료 선택</option>
                      {materials.data?.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {saved && (
                    <label className="field">
                      <span>검토할 학생별 자료</span>
                      <select
                        value={sid}
                        onChange={(e) => setSelectedStudent(e.target.value)}
                      >
                        {saved.targets.map((id) => (
                          <option key={id} value={id}>
                            {students.data?.find((s) => s.id === id)?.name ||
                              id}{" "}
                            ·{" "}
                            {saved.variants[id].native_language ||
                              saved.variants[id].language}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="btn secondary small"
                    disabled={!saved}
                    onClick={loadMaterial}
                  >
                    선택한 자료 불러오기
                  </button>
                </>
              )}
            </details>
            <label className="field">
              <span>번역 자료 PDF (10MB·50쪽 이하)</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  void extract(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="btn secondary small"
              onClick={() =>
                change({
                  title: "재판 용어 병기 검토 예제",
                  subject: "사회",
                  unit: "재판의 당사자",
                  language: "zh",
                  mode: "parallel",
                  material_id: null,
                  document_text:
                    "사회 수업 · 재판의 당사자\n원고: 被告\n원고는 법원에 소송을 제기하는 사람입니다.\n피고: 被告\n피고는 제기된 소송의 상대방입니다.\n소송 대리인: 诉讼代理人\n교사는 각 역할의 뜻과 번역을 비교합니다.",
                })
              }
            >
              오역 검토 예제 불러오기
            </button>
            <label className="field">
              <span>검토할 원문·번역 텍스트</span>
              <textarea
                className="l2-source"
                value={form.document_text}
                maxLength={40000}
                onChange={(e) => change({ document_text: e.target.value })}
                placeholder="한국어와 번역이 함께 있는 자료 또는 번역문을 붙여 넣으세요. PDF 추출 결과도 직접 확인·수정할 수 있습니다."
              />
            </label>
            <small>
              {form.document_text.length.toLocaleString()} / 40,000자 · PDF의
              [쪽 n] 표시를 유지하면 해당 위치를 결과에서 확인할 수 있습니다.
            </small>
            <div className="l2-fields">
              <label className="field">
                <span>검사 모드</span>
                <select
                  value={form.mode}
                  onChange={(e) =>
                    change({ mode: e.target.value as Form["mode"] })
                  }
                >
                  <option value="parallel">한국어·번역 병기 자료</option>
                  <option value="standalone">번역문만 있는 자료</option>
                </select>
              </label>
              <label className="field">
                <span>번역 언어</span>
                <select
                  value={form.language}
                  onChange={(e) => change({ language: e.target.value })}
                >
                  {Object.entries(glossary.data.analysis_languages).map(
                    ([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                        {glossary.data!.languages[id] ? "" : " (대역표 미등록)"}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>교과</span>
                <select
                  value={form.subject}
                  onChange={(e) => change({ subject: e.target.value })}
                >
                  <option value="">자동 추정</option>
                  {["국어", "수학", "과학", "사회"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>단원 (비우면 자동 추정)</span>
                <input
                  value={form.unit}
                  maxLength={100}
                  onChange={(e) => change({ unit: e.target.value })}
                />
              </label>
            </div>
            <p className="muted">
              교과·단원 추정이 불확실하면 분석을 보류합니다. 직접 선택하고 다시
              실행할 수 있습니다.
            </p>
            <button
              className="btn full"
              disabled={
                busy ||
                !form.title.trim() ||
                form.document_text.trim().length < 30
              }
              onClick={analyze}
            >
              {busy ? "검토하고 있어요…" : "오역 검토 실행"}
            </button>
          </fieldset>
        </section>
        <section className="panel l2-results" aria-live="polite">
          <h2>교사용 검토 결과</h2>
          {!report ? (
            <p className="muted">
              자료를 입력하고 검토를 실행하면 원문 근거와 참고 대체어를 볼 수
              있어요. 입력을 바꾸면 다시 검토해야 합니다.
            </p>
          ) : (
            <>
              <p>{report.result.summary}</p>
              <p>
                교과: {report.result.subject || "미정"} (
                {report.result.context_source.subject === "teacher"
                  ? "교사 선택"
                  : `모델 추정 ${Math.round(report.result.subject_confidence * 100)}%`}
                ) · 단원: {report.result.unit || "미정"} (
                {report.result.context_source.unit === "teacher"
                  ? "교사 선택"
                  : `모델 추정 ${Math.round(report.result.unit_confidence * 100)}%`}
                )
              </p>
              {report.result.needs_selection ? (
                <Notice>
                  <strong>분석 보류 · 교과·단원 선택 필요</strong>
                  <p>{report.result.selection_reason}</p>
                  <p>
                    왼쪽에서 교과·단원을 직접 선택하고 ‘오역 검토 실행’을 다시
                    눌러 주세요.
                  </p>
                </Notice>
              ) : (
                <>
                  <div className="l2-counts">
                    <span>
                      오역 의심{" "}
                      <strong>{report.result.counts.suspected}</strong>
                    </span>
                    <span>
                      약한 후보 <strong>{report.result.counts.weak}</strong>
                    </span>
                    <span>
                      인식 오류 의심{" "}
                      <strong>{report.result.counts.recognition}</strong>
                    </span>
                  </div>
                  <p className="muted">
                    인식 오류는 오역 건수에 합산하지 않습니다. 같은 용어·문구는
                    한 후보로 묶습니다.
                  </p>
                  {!report.result.items.length &&
                    !report.result.weak_candidates.length && (
                      <p>
                        제시할 후보가 없습니다. 번역에 오류가 없다고 검증한
                        결과는 아닙니다.
                      </p>
                    )}
                  {report.result.items.map((item, i) => (
                    <CandidateCard key={`item-${i}`} item={item} />
                  ))}
                  {!!report.result.weak_candidates.length && (
                    <h3>근거가 부족한 약한 후보</h3>
                  )}
                  {report.result.weak_candidates.map((item, i) => (
                    <CandidateCard key={`weak-${i}`} item={item} />
                  ))}
                </>
              )}
              <details className="l2-import">
                <summary>검토 범위와 주의점</summary>
                <ul>
                  {report.result.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
              {report.material_id && (
                <p>
                  <Link
                    className="text-link"
                    to={`/app/materials/${report.material_id}`}
                  >
                    연결된 수업 자료 열기
                  </Link>
                </p>
              )}
              <small>
                검토 당시의 텍스트로 저장한 결과입니다. 이 분석은 원래 수업
                자료를 수정하거나 학생에게 배포하지 않습니다.
              </small>
            </>
          )}
        </section>
      </div>
      <section className="panel l2-reference">
        <details>
          <summary>이미지에서 추가한 대역표 · 3개 용어 × 5개 언어</summary>
          <p>{glossary.data.notice}</p>
          <div className="l2-table-scroll">
            <table className="glossary-table">
              <thead>
                <tr>
                  <th>한국어</th>
                  {Object.values(glossary.data.languages).map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {glossary.data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <th>{entry.term}</th>
                    {Object.keys(glossary.data!.languages).map((lang) => (
                      <td key={lang} lang={lang}>
                        {entry.translations[lang]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            출처: {glossary.data.source} · {glossary.data.version}
          </p>
          <ul>
            {glossary.data.transcription_notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      </section>
      <section className="panel l2-history">
        <h2>저장된 검토 기록</h2>
        {history.error ? (
          <ErrorState message={history.error} retry={history.reload} />
        ) : !history.data ? (
          <Loading />
        ) : !history.data.length ? (
          <p>아직 검토 기록이 없습니다.</p>
        ) : (
          <ul>
            {history.data.map((entry) => (
              <li key={entry.id}>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => openReport(entry.id)}
                >
                  {entry.title}
                </button>
                <span>
                  {entry.needs_selection
                    ? "분석 보류"
                    : `의심 ${entry.counts.suspected} · 약한 후보 ${entry.counts.weak} · 인식 ${entry.counts.recognition}`}{" "}
                  · {new Date(entry.created_at).toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CandidateCard({ item }: { item: ReviewCandidate }) {
  const label =
    item.status === "recognition"
      ? "인식 오류 의심"
      : item.status === "suspected"
        ? "오역 의심"
        : "약한 후보 · 확인 필요";
  return (
    <article className="l2-candidate">
      <div className="l2-candidate-heading">
        <h3>{item.term}</h3>
        <Badge tone="orange">{label}</Badge>
      </div>
      <p>
        <strong>검토 문구:</strong> {item.wrong}
      </p>
      <blockquote>{item.quote}</blockquote>
      <p>{item.reason}</p>
      {item.correct && (
        <p>
          <strong>참고 대체어:</strong> <span>{item.correct}</span>{" "}
          <small>(이미지 대역표 · 검수 전)</small>
        </p>
      )}
      {!item.correct && (
        <p className="muted">
          확인된 대체어를 제시할 근거가 부족합니다. 원문과 교과 맥락을 확인해
          주세요.
        </p>
      )}
      <p className="muted">
        {item.reference_translation
          ? item.glossary_match
            ? "대역표와 일치하지만 문맥 검토가 필요합니다."
            : "대역표와 차이가 있습니다. 차이만으로 오역을 확정하지 않습니다."
          : "대역표에 없는 용어·언어입니다."}
      </p>
      {item.cause && (
        <p>
          <strong>원인 추정:</strong> {item.cause}
        </p>
      )}
      <p>
        서로 다른 근거 {item.independent_signal_count}종류 · 동일 문구 출현{" "}
        {item.occurrences}회
      </p>
      <p className="muted">
        문구 출현 횟수에는 올바르게 쓰인 위치도 포함될 수 있으며, 오역 발생
        횟수를 뜻하지 않습니다.
      </p>
      <ul>
        {item.signals.map((signal, i) => (
          <li key={i}>
            <strong>{signal.label}</strong>
            <p>“{signal.quote}”</p>
            <p>{signal.explanation}</p>
          </li>
        ))}
      </ul>
      <details>
        <summary>원문 위치 확인</summary>
        <ul>
          {item.locations.map((loc) => (
            <li key={loc.segment_id}>
              <strong>{loc.location}</strong> · {loc.occurrences}회
              <p>{loc.quote}</p>
            </li>
          ))}
        </ul>
      </details>
      <small>{item.decision_note}</small>
    </article>
  );
}
