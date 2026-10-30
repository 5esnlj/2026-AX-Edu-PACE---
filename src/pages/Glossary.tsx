import { Languages, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, useResource } from "../api";
import {
  Badge,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  SectionTitle,
  useToast,
} from "../components";
import { languages, type Term } from "../types";

type GlossaryData = {
  terms: Term[];
  languages: Record<string, string>;
  notice: string;
};
type GlossaryResult = {
  term: string;
  candidate: string;
  expected: string | null;
  status: string;
  reason: string;
};
export function Glossary() {
  const { data, error, reload } = useResource<GlossaryData>("/glossary");
  const [language, setLanguage] = useState("en");
  const [term, setTerm] = useState("민주주의");
  const [candidate, setCandidate] = useState("monarchy");
  const [result, setResult] = useState<GlossaryResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function check() {
    setBusy(true);
    try {
      setResult(
        await api("/glossary/check", {
          method: "POST",
          body: JSON.stringify({ language, entries: [{ term, candidate }] }),
        }),
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeading
        eyebrow="작은 낱말도 정확하게"
        title="교과어 번역 검토"
        description="교과 개념이 번역 속에서 달라지지 않도록, 참고 대역과 비교해요."
      />
      <Notice>
        {data.notice} 현재 검사는 문자열 비교입니다. 맥락을 분석하는 오역 탐지
        AI는 연결되지 않았습니다.
      </Notice>
      <div className="glossary-layout">
        <section className="panel">
          <SectionTitle title="교과어 대역표">
            <label className="field compact-field">
              <span className="sr-only">검토 언어</span>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setResult(null);
                }}
              >
                {Object.entries(languages).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </SectionTitle>
          <table className="glossary-table">
            <thead>
              <tr>
                <th>교과어</th>
                <th>{languages[language]}</th>
                <th>쉬운 뜻</th>
              </tr>
            </thead>
            <tbody>
              {data.terms.map((t) => (
                <tr key={t.term}>
                  <td>
                    <strong>{t.term}</strong>
                  </td>
                  <td lang={language}>{t.translations[language]}</td>
                  <td>{t.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div>
          <section className="panel form-panel">
            <SectionTitle title="번역 후보 확인하기">
              <Languages size={20} />
            </SectionTitle>
            <label className="field">
              원문 교과어
              <input
                value={term}
                maxLength={100}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setResult(null);
                }}
                list="glossary-terms"
              />
              <datalist id="glossary-terms">
                {data.terms.map((t) => (
                  <option key={t.term}>{t.term}</option>
                ))}
              </datalist>
            </label>
            <label className="field">
              {languages[language]} 번역 후보
              <input
                value={candidate}
                maxLength={300}
                onChange={(e) => {
                  setCandidate(e.target.value);
                  setResult(null);
                }}
              />
            </label>
            <button
              className="btn full"
              disabled={busy || !term.trim() || !candidate.trim()}
              onClick={check}
            >
              <ShieldCheck size={17} />
              참고 대역과 비교
            </button>
          </section>
          {result?.map((r) => (
            <section className="panel glossary-result" key={r.term}>
              <Badge tone={r.status === "match" ? "green" : "orange"}>
                {r.status === "match"
                  ? "대역표 일치"
                  : r.status === "unknown"
                    ? "미등록 용어"
                    : "교사 검토 필요"}
              </Badge>
              <h3>{r.term}</h3>
              <p>{r.reason}</p>
              {r.expected && (
                <div>
                  <small>참고 대역</small>
                  <strong>{r.expected}</strong>
                </div>
              )}
            </section>
          ))}
          <div className="insight-card">
            <h3>
              번역 하나에도,
              <br />
              교과의 맥락을 담아요.
            </h3>
            <p>
              우즈베크어·몽골어·벵골어처럼 검토 자원이 적은 언어는 전문 검수와
              대역표 확충이 특히 중요해요.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
