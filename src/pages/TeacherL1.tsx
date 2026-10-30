import { useState } from "react";
import "../l1.css";
import { api, useResource } from "../api";
import {
  Badge,
  ErrorState,
  Loading,
  Modal,
  Notice,
  useToast,
} from "../components";
import type { Student } from "../types";
import {
  l1Actions,
  l1Methods,
  l1Tiers,
  type L1Edits,
  type L1Result,
} from "../l1";

export function TeacherL1Review({
  data,
  edits,
  readOnly,
  onChange,
}: {
  data: L1Result;
  edits: L1Edits;
  readOnly: boolean;
  onChange: (value: L1Edits) => void;
}) {
  const decision = data.learner_decision;
  const subject = decision.subject_profile_used;
  function speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(text);
    message.lang = "ko-KR";
    window.speechSynthesis.speak(message);
  }
  return (
    <div className="l1-review">
      <section aria-label="L1 지원 판단">
        <h3>학생 프로필과 지원 판단</h3>
        <p>
          {data.profile_context.source === "teacher"
            ? "교사가 등록한 L1 프로필"
            : "기존 앱 참고 기록"}
          {" · "}
          {data.profile_context.level_scale === "diagnostic_1_6"
            ? "1~6단계 척도"
            : "1~4단계 척도"}
        </p>
        <p>
          종합 단계: {decision.diagnosed_level ?? "진단 정보 없음"} · 모국어:{" "}
          {decision.native_language || "미등록"}
        </p>
        <p>
          교과 참고 단계:{" "}
          {subject.representative_level ?? subject.level ?? "정보 없음"}
          {(subject.recheck_required || subject.uncertain) && " · 재확인 필요"}
        </p>
        {!!subject.uncertainty_flags?.length && (
          <p>불확실성: {subject.uncertainty_flags.join(", ")}</p>
        )}
        {!!data.profile_context.bottlenecks.length && (
          <p>등록된 지원 영역: {data.profile_context.bottlenecks.join(", ")}</p>
        )}
        <div className="l1-badges">
          {decision.methods_selected.map((m) => (
            <Badge key={m}>{l1Methods[m] || m}</Badge>
          ))}
        </div>
        <ul>
          {decision.rationale.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </section>
      <Notice>
        <strong>교사 확인 항목</strong>
        <ul>
          {[
            ...data.warnings,
            ...data.recognition.uncertain_spans,
            ...data.teacher_review.questions,
          ].map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
        {data.recognition.page_notes.map((v, i) => (
          <p key={i}>{v}</p>
        ))}
      </Notice>
      <h3>문장별 재구성 검토</h3>
      <p className="muted">
        선택하지 않은 문장은 원문 그대로 최종 자료에 포함됩니다.
      </p>
      {data.key_sentences.map((sentence, index) => (
        <section className="l1-card" key={sentence.id}>
          <strong>{sentence.id} · 원문</strong>
          {sentence.fixed && <Badge tone="neutral">원문 고정</Badge>}
          <p className="l1-source">{sentence.source}</p>
          <p className="muted">
            초안의 처리·근거:{" "}
            {sentence.operations.map((op) => l1Actions[op]).join(" · ")} —{" "}
            {sentence.rationale}
          </p>
          {!!sentence.swaps?.length && (
            <div className="phrase-review">
              <strong>초안에서 바뀐 표현</strong>
              <ul>
                {sentence.swaps.map((swap, i) => (
                  <li key={i}>
                    <span className="swap-before">{swap.original}</span> →{" "}
                    <span className="swap-after">{swap.replacement}</span>
                  </li>
                ))}
              </ul>
              <small>
                직접 수정한 문장은 저장 후 학생용 미리보기에서 확인해 주세요.
              </small>
            </div>
          )}
          {sentence.explanation && (
            <details className="reading-explanation">
              <summary>학생에게 제공할 쉬운 설명</summary>
              <label className="field">
                <span>{sentence.id} 쉬운 설명 수정</span>
                <textarea
                  readOnly={readOnly}
                  maxLength={4000}
                  value={edits.sentences[index].explanation || ""}
                  onChange={(e) =>
                    onChange({
                      ...edits,
                      sentences: edits.sentences.map((s, i) =>
                        i === index ? { ...s, explanation: e.target.value } : s,
                      ),
                    })
                  }
                />
              </label>
            </details>
          )}
          <label className="field">
            <span>{sentence.id} 재구성 문장 수정</span>
            <textarea
              readOnly={readOnly || sentence.fixed}
              maxLength={4000}
              value={edits.sentences[index].rewritten}
              onChange={(e) =>
                onChange({
                  ...edits,
                  sentences: edits.sentences.map((s, i) =>
                    i === index ? { ...s, rewritten: e.target.value } : s,
                  ),
                })
              }
            />
          </label>
          {!readOnly && !sentence.fixed && (
            <div className="phrase-review-actions">
              <small>수정 후 저장하면 기존 검토 완료가 해제됩니다.</small>
              <button
                type="button"
                className="text-link"
                disabled={edits.sentences[index].rewritten === sentence.source}
                onClick={() =>
                  onChange({
                    ...edits,
                    sentences: edits.sentences.map((s, i) =>
                      i === index ? { ...s, rewritten: sentence.source } : s,
                    ),
                  })
                }
              >
                {sentence.id} 원문으로 되돌리기
              </button>
            </div>
          )}
        </section>
      ))}
      <h3>어휘 위계와 번역 검토</h3>
      {!data.vocabulary.length && <p>선별된 핵심어가 없습니다.</p>}
      {data.vocabulary.map((term, index) => {
        const value = edits.vocabulary[index];
        const update = (patch: Partial<typeof value>) =>
          onChange({
            ...edits,
            vocabulary: edits.vocabulary.map((v, i) =>
              i === index ? { ...v, ...patch } : v,
            ),
          });
        return (
          <section className="l1-card" key={term.term}>
            <div className="l1-row">
              <strong>{term.term}</strong>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => speak(term.term)}
                aria-label={`${term.term} 발음 듣기`}
              >
                발음 듣기
              </button>
            </div>
            <p className="muted">
              원문: {term.source_sentence_ids.join(", ")} · 저장된 단어 상태:{" "}
              {term.knowledge_state === "known"
                ? "알고 있어요"
                : term.knowledge_state === "unknown"
                  ? "더 배울래요"
                  : "표시 없음"}
            </p>
            <div className="l1-fields">
              <label className="field">
                <span>{term.term} 위계</span>
                <select
                  disabled={readOnly}
                  value={value.tier}
                  onChange={(e) => update({ tier: e.target.value })}
                >
                  {["1", "2-1", "2-2", "2-3", "3", "unknown_needs_teacher"].map(
                    (id) => (
                      <option value={id} key={id}>
                        {l1Tiers[id]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>{term.term} 처리</span>
                <select
                  disabled={readOnly}
                  value={value.action}
                  onChange={(e) => update({ action: e.target.value })}
                >
                  {Object.entries(l1Actions).map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>{term.term} 쉬운 뜻</span>
              <textarea
                readOnly={readOnly}
                maxLength={4000}
                value={value.simple_meaning}
                onChange={(e) => update({ simple_meaning: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{term.term} 번역 수정</span>
              <input
                readOnly={readOnly || !decision.native_language}
                maxLength={300}
                value={value.translation}
                onChange={(e) => update({ translation: e.target.value })}
              />
            </label>
            <small>
              번역 근거가 부족하면 빈칸으로 남겨 둘 수 있습니다. 교과 개념어는
              재구성 글에서도 유지해 주세요.
            </small>
          </section>
        );
      })}
      <h3>시각 자료 검토</h3>
      {!data.visual_aids.length && (
        <p>이 자료에서는 시각 자료가 제안되지 않았습니다.</p>
      )}
      {data.visual_aids.map((visual, index) => {
        const value = edits.visual_aids[index];
        const update = (patch: Partial<typeof value>) =>
          onChange({
            ...edits,
            visual_aids: edits.visual_aids.map((v, i) =>
              i === index ? { ...v, ...patch } : v,
            ),
          });
        return (
          <section className="l1-card" key={index}>
            <p>
              {visual.kind} · {visual.rationale}
            </p>
            <p className="muted">
              원문 근거: {visual.source_sentence_ids.join(", ")}
            </p>
            <label className="field">
              <span>시각 자료 {index + 1} 제목</span>
              <input
                readOnly={readOnly}
                maxLength={300}
                value={value.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>시각 자료 {index + 1} 설명</span>
              <textarea
                readOnly={readOnly}
                value={value.description}
                maxLength={4000}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
            <label className="field">
              <span>시각 자료 {index + 1} 항목 (한 줄에 하나)</span>
              <textarea
                readOnly={readOnly}
                value={value.items.join("\n")}
                onChange={(e) => update({ items: e.target.value.split("\n") })}
              />
            </label>
            <label className="field">
              <span>시각 자료 {index + 1} 대체 설명</span>
              <textarea
                readOnly={readOnly}
                value={value.alt_text}
                maxLength={4000}
                onChange={(e) => update({ alt_text: e.target.value })}
              />
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                disabled={readOnly || !visual.needed}
                checked={value.visible_by_default}
                onChange={(e) =>
                  update({ visible_by_default: e.target.checked })
                }
              />
              학생 자료에 표시
            </label>
          </section>
        );
      })}
    </div>
  );
}

type Profile = Record<string, unknown>;
type ProfileResponse = { profile: Profile; source: string };

export function L1ProfileModal({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const resource = useResource<ProfileResponse>(
    `/students/${encodeURIComponent(student.id)}/reconstruction-profile`,
  );
  if (resource.error)
    return (
      <Modal title="L1 프로필" onClose={onClose}>
        <ErrorState message={resource.error} retry={resource.reload} />
      </Modal>
    );
  if (!resource.data)
    return (
      <Modal title="L1 프로필" onClose={onClose}>
        <Loading />
      </Modal>
    );
  return (
    <L1ProfileEditor
      key={student.id}
      student={student}
      initial={resource.data}
      onClose={onClose}
    />
  );
}

function L1ProfileEditor({
  student,
  initial,
  onClose,
}: {
  student: Student;
  initial: ProfileResponse;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([initial.profile]);
  const [selection, setSelection] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const profile = profiles[selection];
  function importProfiles(value: unknown) {
    const entries =
      typeof value === "object" && value !== null && "learners" in value
        ? (value as { learners: unknown }).learners
        : [value];
    if (
      !Array.isArray(entries) ||
      entries.length === 0 ||
      entries.length > 100 ||
      entries.some((p) => !p || typeof p !== "object" || Array.isArray(p))
    )
      throw new Error("learners 배열 또는 단일 프로필 JSON을 선택해 주세요.");
    setProfiles(entries as Profile[]);
    setSelection(0);
  }
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100000)
        throw new Error("100KB 이하의 프로필 JSON을 선택해 주세요.");
      importProfiles(JSON.parse((await file.text()).replace(/^\uFEFF/, "")));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await api(
        `/students/${encodeURIComponent(student.id)}/reconstruction-profile`,
        { method: "PUT", body: JSON.stringify(profile) },
      );
      toast(`${student.name}의 L1 프로필을 저장했어요.`);
      onClose();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`${student.name} · 교사용 L1 프로필`} onClose={onClose}>
      <p>
        이 학생에게 연결할 진단 프로필을 확인해 주세요. 새로 생성하는 자료부터
        적용됩니다.
      </p>
      <Notice>
        기존 앱 기록은 1~4단계이며, 팀원의 진단 프로필은 1~6단계입니다. 서로
        변환하거나 기존 점검 결과를 덮어쓰지 않습니다.
      </Notice>
      <label className="field">
        <span>팀원의 learners.json 불러오기</span>
        <input
          disabled={busy}
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <button
        className="btn secondary small"
        disabled={busy}
        onClick={async () => {
          try {
            importProfiles(await api("/l1/example-profile"));
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      >
        첨부 예시 프로필 불러오기
      </button>
      <label className="field">
        <span>연결할 프로필 선택</span>
        <select
          disabled={busy}
          value={selection}
          onChange={(e) => setSelection(Number(e.target.value))}
        >
          {profiles.map((p, i) => (
            <option key={i} value={i}>
              {String(p.display_name || p.learner_id || `프로필 ${i + 1}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>L1 프로필 모국어</span>
        <input
          disabled={busy}
          maxLength={300}
          value={
            typeof profile.native_language === "string"
              ? profile.native_language
              : ""
          }
          onChange={(e) =>
            setProfiles(
              profiles.map((p, i) =>
                i === selection
                  ? { ...p, native_language: e.target.value || null }
                  : p,
              ),
            )
          }
        />
      </label>
      <p>
        종합 진단: {String(profile.overall_korean_level ?? "정보 없음")} · 척도:{" "}
        {profile.level_scale === "app_1_4" ? "1~4단계" : "1~6단계"}
      </p>
      <details>
        <summary>교과별 진단과 전체 내용 확인</summary>
        <pre className="l1-profile-json">
          {JSON.stringify(profile, null, 2)}
        </pre>
      </details>
      <div className="form-actions">
        <button
          className="btn secondary"
          disabled={busy || initial.source !== "teacher"}
          onClick={async () => {
            setBusy(true);
            try {
              await api(
                `/students/${encodeURIComponent(student.id)}/reconstruction-profile`,
                { method: "DELETE" },
              );
              toast("L1 연결을 해제했어요. 기존 앱 기록을 참고합니다.");
              onClose();
            } catch (e) {
              toast((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          L1 연결 해제
        </button>
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? "저장 중…" : `${student.name}에게 프로필 저장`}
        </button>
      </div>
    </Modal>
  );
}
