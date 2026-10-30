import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, FileText, ArrowRight } from "lucide-react";
import { api, useResource } from "../api";
import { Badge, ErrorState, Loading, useToast } from "../components";
import type { ReadingSupport } from "../l1";
import type { Student } from "../types";
import "../reconstruction-support.css";

export type CivilTrialExample = {
  title: string;
  subject: string;
  unit: string;
  source_text: string;
  source_pdf_url: string;
  notice: string;
  profiles: { label: string; profile: Record<string, unknown> }[];
};

export const CIVIL_TRIAL_TITLE = "민사 재판의 의미와 소송 대리인의 역할";

export function CivilTrialCard() {
  return (
    <Link
      className="material-card"
      to="/app/create?example=civil-trial"
      aria-label="민사 재판 예시로 만들기"
    >
      <div className="material-cover cover-사회">
        <div className="cover-caption">가나다계단 CLASSROOM</div>
        <div className="cover-art">
          <BookOpen size={48} />
          <span>✦</span>
        </div>
        <span>사회 · 재판의 의미와 공정한 재판</span>
      </div>
      <div className="material-card-body">
        <div className="section-title">
          <Badge tone="neutral">예시 자료</Badge>
          <small>사회</small>
        </div>
        <h2>{CIVIL_TRIAL_TITLE}</h2>
        <p>210~211쪽 PDF로 학생별 맞춤 자료를 만들어요.</p>
        <div className="material-card-footer">
          <span>
            <FileText size={14} />
            원본 PDF · 재구성 예시
          </span>
          <ArrowRight size={18} />
        </div>
      </div>
    </Link>
  );
}

export function SourcePdfPreview({
  url,
  open = false,
}: {
  url: string;
  open?: boolean;
}) {
  // Only server-owned example assets are embedded. Arbitrary submitted URLs are not loaded.
  if (url !== "/examples/civil-trial-source.pdf") return null;
  return (
    <details className="source-pdf-preview" open={open || undefined}>
      <summary>
        <FileText size={17} /> 원본 PDF 지면 보기 · 210~211쪽
      </summary>
      <p>
        그림과 배치는 원본으로 확인하고, 재구성 글은 아래에서 비교해 주세요.
      </p>
      <div className="source-pdf-pages">
        {[1, 2].map((page) => (
          <a
            key={page}
            href={`${url}#page=${page}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`원본 PDF ${209 + page}쪽 새 창에서 보기`}
          >
            <img
              loading="lazy"
              src={`/examples/civil-trial-page-${page}.png`}
              alt={`민사 재판 수업 자료 ${209 + page}쪽 원본. 내용은 재구성 입력의 원문 텍스트에서 확인할 수 있습니다.`}
            />
            <span>{209 + page}쪽 · 크게 보기</span>
          </a>
        ))}
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="text-link">
        원본 PDF 열기
      </a>
    </details>
  );
}

export function CivilTrialLoader({
  onUse,
  students,
  initiallyOpen = false,
}: {
  onUse: (example: CivilTrialExample) => void;
  students: Student[];
  initiallyOpen?: boolean;
}) {
  const example = useResource<CivilTrialExample>("/l1/civil-trial-example");
  const [profileIndex, setProfileIndex] = useState(0);
  const [studentId, setStudentId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function saveProfile() {
    if (!example.data || !studentId || !confirmed) return;
    setBusy(true);
    try {
      await api(
        `/students/${encodeURIComponent(studentId)}/reconstruction-profile`,
        {
          method: "PUT",
          body: JSON.stringify(example.data.profiles[profileIndex].profile),
        },
      );
      toast(
        "선택한 학생에게 예시 프로필을 연결했어요. 다음 자료 생성부터 적용됩니다.",
      );
      setConfirmed(false);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="civil-loader" open={initiallyOpen || undefined}>
      <summary>민사 재판 PDF 예시로 재구성하기</summary>
      {example.error ? (
        <ErrorState message={example.error} retry={example.reload} />
      ) : !example.data ? (
        <Loading />
      ) : (
        <>
          <p>
            첨부 자료의 원문과 수업 용어를 불러온 뒤, 우리 반 학생을 선택해
            검토·배포할 수 있어요.
          </p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => onUse(example.data!)}
          >
            민사 재판 예시 불러오기
          </button>
          <SourcePdfPreview url={example.data.source_pdf_url} />
          <details className="civil-profile-picker">
            <summary>예시 진단 프로필 연결하기 (선택)</summary>
            <p>
              첨부한 시연용 프로필입니다. 실제 진단이 아니며 기존 1~4단계 기록과
              환산하지 않습니다. 연결하지 않으면 학생에게 현재 저장된 프로필을
              사용합니다.
            </p>
            <fieldset disabled={busy}>
              <label className="field">
                <span>시연 프로필</span>
                <select
                  value={profileIndex}
                  onChange={(e) => {
                    setProfileIndex(Number(e.target.value));
                    setConfirmed(false);
                  }}
                >
                  {example.data.profiles.map((profile, i) => (
                    <option value={i} key={i}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>프로필을 연결할 학생</span>
                <select
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">학생을 선택해 주세요</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </label>
              <details>
                <summary>선택한 프로필 내용 확인</summary>
                <pre>
                  {JSON.stringify(
                    example.data.profiles[profileIndex]?.profile,
                    null,
                    2,
                  )}
                </pre>
              </details>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                선택한 학생의 기존 L1 프로필을 이 시연 프로필로 바꾸는 것을
                확인했습니다.
              </label>
              <button
                type="button"
                className="btn secondary small"
                disabled={!studentId || !confirmed || busy}
                onClick={saveProfile}
              >
                시연 프로필 연결
              </button>
            </fieldset>
          </details>
          <small>{example.data.notice}</small>
        </>
      )}
    </details>
  );
}

function ChangedPhrase({
  original,
  replacement,
}: {
  original: string;
  replacement: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="changed-phrase">
      <button
        type="button"
        aria-expanded={open}
        title="눌러서 원래 표현 확인"
        onClick={() => setOpen(!open)}
      >
        {replacement}
      </button>
      {open && <small className="phrase-original">{original}</small>}
    </span>
  );
}

function SupportedSentence({ entry }: { entry: ReadingSupport }) {
  let cursor = 0;
  let rebuilt = "";
  const parts: ReactNode[] = [];
  for (const [i, swap] of entry.swaps.entries()) {
    const at = entry.source.indexOf(swap.original, cursor);
    if (!swap.original || at < 0) return <>{entry.rewritten}</>;
    const before = entry.source.slice(cursor, at);
    parts.push(before, <ChangedPhrase key={i} {...swap} />);
    rebuilt += before + swap.replacement;
    cursor = at + swap.original.length;
  }
  const tail = entry.source.slice(cursor);
  rebuilt += tail;
  parts.push(tail);
  return (
    <span className="supported-sentence">
      {rebuilt === entry.rewritten ? parts : entry.rewritten}
    </span>
  );
}

export function SupportedReading({
  text,
  support = [],
}: {
  text: string;
  support?: ReadingSupport[];
}) {
  // Keep the entire saved text, including paragraphs the agent did not transform.
  // Only annotate exact matches in source order; mismatched or stale metadata cannot replace text.
  const used = new Set<string>();
  const paragraphs = text.split("\n").map((paragraph, paragraphIndex) => {
    let cursor = 0;
    const nodes: ReactNode[] = [];
    for (const entry of support) {
      if (
        used.has(entry.id) ||
        !entry.rewritten ||
        (!entry.swaps?.length && !entry.explanation)
      )
        continue;
      const at = paragraph.indexOf(entry.rewritten, cursor);
      if (at < 0) continue;
      used.add(entry.id);
      nodes.push(
        <span key={`before-${entry.id}`}>{paragraph.slice(cursor, at)}</span>,
      );
      nodes.push(<SupportedSentence key={entry.id} entry={entry} />);
      if (entry.explanation)
        nodes.push(
          <details key={`explain-${entry.id}`} className="reading-explanation">
            <summary>쉬운 설명 펼치기</summary>
            <p>{entry.explanation}</p>
          </details>,
        );
      cursor = at + entry.rewritten.length;
    }
    if (!nodes.length) return <p key={paragraphIndex}>{paragraph || <br />}</p>;
    nodes.push(<span key="remaining">{paragraph.slice(cursor)}</span>);
    return (
      <div key={paragraphIndex} className="supported-paragraph">
        {nodes}
      </div>
    );
  });
  return (
    <div className="supported-reading">
      {support.some((entry) => entry.swaps?.length) && (
        <small className="reading-hint">
          밑줄 친 표현을 누르면 원래 표현을 볼 수 있어요.
        </small>
      )}
      {paragraphs}
    </div>
  );
}
