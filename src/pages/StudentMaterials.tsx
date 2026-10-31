import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Plus,
  UploadCloud,
  Volume2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, useAgentHealth, useResource } from "../api";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
} from "../components";
import { useSession } from "../session";
import { studentLevelLabel } from "../types";
import type { StudentMaterial } from "../student-materials";
import "../student-materials.css";
import { StudentAssessment } from "./StudentAssessment";
import { StudentPracticeGenerator } from "./StudentPractice";

export function StudentMaterialList({
  search = "",
  subject = "전체",
  assessments = false,
}: {
  search?: string;
  subject?: string;
  assessments?: boolean;
}) {
  const { data, error, reload } =
    useResource<StudentMaterial[]>("/student-materials");
  const visible = (data || []).filter(
    (m) =>
      m.title.includes(search) &&
      (subject === "전체" || subject === m.subject) &&
      (!assessments || m.quiz),
  );
  if (assessments && data && !visible.length && !error) return null;
  return (
    <section
      className="student-material-section"
      aria-label={assessments ? "내 자료 이해 확인" : "내가 만든 학습 자료"}
    >
      <div className="section-title">
        <h2>{assessments ? "내 자료 이해 확인" : "내가 만든 학습 자료"}</h2>
        {!assessments && <Badge tone="blue">나만의 학습 공간</Badge>}
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : !data ? (
        <Loading />
      ) : !visible.length ? (
        <Empty
          title={
            assessments
              ? "아직 내 자료의 이해 확인이 없어요"
              : "직접 만든 자료를 모아 볼까요?"
          }
          description={
            assessments
              ? "나의 수업 자료에서 학습을 마친 뒤, 원할 때 문항을 만들 수 있어요."
              : "글이나 PDF를 올리면 내 진단 결과를 반영한 학습 자료로 만들어 줘요. 검색 중이라면 조건을 바꿔 보세요."
          }
          action={
            <Link
              className="btn secondary small"
              to={assessments ? "/app/materials" : "/app/my-materials/create"}
            >
              {assessments ? "나의 수업 자료로" : "첫 자료 만들어 보기"}
              <ArrowRight size={16} />
            </Link>
          }
        />
      ) : (
        <div className="material-grid">
          {visible.map((m) => (
            <Link
              className="material-card student-own-card"
              key={m.id}
              to={`/app/my-materials/${m.id}${assessments ? "?quiz=1" : ""}`}
            >
              <div className="student-own-cover">
                <BookOpen size={30} />
                <span>{m.subject} · 나의 맞춤 자료</span>
              </div>
              <div className="material-card-body">
                <Badge
                  tone={
                    m.attempt ? "green" : m.completed_at ? "blue" : "orange"
                  }
                >
                  {m.attempt
                    ? "이해 확인 완료"
                    : m.completed_at
                      ? "학습 완료"
                      : "읽어 볼까요?"}
                </Badge>
                <h3>{m.title}</h3>
                {m.unit && <p>{m.unit}</p>}
                <p>
                  {m.result.provider === "solar"
                    ? "Solar로 재구성한 자료"
                    : m.result.provider === "original"
                      ? "진단 전 · 원문 학습 자료"
                      : "규칙 기반 데모 자료"}
                </p>
                {m.attempt && (
                  <p>
                    이해 확인 {m.attempt.score} / {m.attempt.total}문항
                  </p>
                )}
                <div className="material-card-footer">
                  <span>{assessments ? "문항과 결과 보기" : "이어 읽기"}</span>
                  <ArrowRight size={18} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function CreateStudentMaterial() {
  const { user } = useSession();
  const { data: health, error: healthError, reload } = useAgentHealth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("사회");
  const [unit, setUnit] = useState("");
  const [source, setSource] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  async function extract(file: File | undefined) {
    if (!file) return;
    setError("");
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ text: string; filename: string }>(
        "/student-materials/extract",
        { method: "POST", body: form },
      );
      setSource(result.text);
      setFilename(result.filename);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<StudentMaterial>("/student-materials", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          subject,
          unit: unit.trim(),
          source_text: source.trim(),
        }),
      });
      navigate(`/app/my-materials/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/app/materials">
        <ArrowLeft size={16} />
        나의 수업 자료
      </Link>
      <PageHeading
        eyebrow="내 속도로 이해하는 수업"
        title="내 자료 재구성하기"
        description="배울 글을 넣어 주세요. 핵심 개념을 지키면서 나에게 필요한 설명을 더해요."
      />
      <div className="student-profile-strip">
        <Badge tone="blue">
          {user?.student ? studentLevelLabel(user.student) : "진단 전"}
        </Badge>
        <span>로그인한 나의 6수준 진단 결과를 자동으로 적용해요.</span>
      </div>
      {healthError ? (
        <ErrorState message={healthError} retry={reload} />
      ) : (
        health && (
          <Notice>
            {health.provider === "solar"
              ? health.configured
                ? "Solar가 자료를 재구성해요. 입력한 글과 필요한 진단 정보가 AI 서비스에 전달돼요."
                : "Solar API 키가 설정되지 않았어요. 선생님이나 운영자에게 연결 설정을 요청해 주세요."
              : "현재 규칙 기반 데모예요. 원문 보존과 학습 흐름을 체험할 수 있으며, AI가 문장을 다시 쓰는 기능은 Solar 연결 후 사용할 수 있어요."}
          </Notice>
        )
      )}
      <form className="panel student-source-form" onSubmit={create}>
        <div className="form-row">
          <label className="field">
            자료 제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              placeholder="예: 민사 재판의 과정"
              disabled={busy || extracting}
            />
          </label>
          <label className="field">
            교과
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy || extracting}
            >
              {["사회", "과학", "수학", "국어"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          단원 (선택)
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            maxLength={100}
            placeholder="예: 민주주의와 시민 참여"
            disabled={busy || extracting}
          />
        </label>
        <label className="student-upload">
          <UploadCloud size={25} />
          <span>
            {extracting
              ? "파일에서 글을 읽고 있어요…"
              : "PDF 파일에서 가져오기"}
          </span>
          <input
            aria-label="수업 자료 파일"
            type="file"
            accept=".pdf,application/pdf"
            disabled={busy || extracting}
            onChange={(e) => {
              void extract(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p className="muted">
          10MB·50쪽 이하의 PDF를 사용할 수 있어요. 파일 대신 아래에 글을 직접
          붙여 넣어도 돼요. 스캔된 PDF는 글자를 추출할 수 없으니 텍스트를 붙여
          넣어 주세요.
        </p>
        {filename && (
          <p role="status">
            {filename}에서 가져왔어요. 아래 글이 정확한지 확인해 주세요.
          </p>
        )}
        <label className="field">
          수업 자료 원문
          <textarea
            aria-label="수업 자료 원문"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={13}
            minLength={20}
            maxLength={40000}
            required
            disabled={busy || extracting}
            placeholder="배울 글을 20자 이상 넣어 주세요. 파일에서 가져온 글도 수정할 수 있어요."
          />
          <small>
            {source.length.toLocaleString()} / 40,000자 · 핵심 개념과 설명이
            포함되도록 넣어 주세요.
          </small>
        </label>
        {error && (
          <div role="alert">
            <Notice>{error}</Notice>
          </div>
        )}
        <div className="form-actions">
          <Link className="btn secondary" to="/app/materials">
            목록으로
          </Link>
          <button
            className="btn"
            disabled={
              busy ||
              extracting ||
              !health ||
              !!healthError ||
              (health.provider === "solar" && !health.configured) ||
              source.trim().length < 20 ||
              !title.trim()
            }
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Plus size={18} />
            )}
            {busy ? "나에게 맞는 자료를 만들고 있어요…" : "나에게 맞게 재구성"}
          </button>
        </div>
      </form>
    </>
  );
}

export function StudentMaterialPage() {
  const { id } = useParams();
  const { data, error, reload } = useResource<StudentMaterial>(
    `/student-materials/${id}`,
  );
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  return <StudentReader key={data.id} initial={data} />;
}

function StudentReader({ initial }: { initial: StudentMaterial }) {
  const [material, setMaterial] = useState(initial);
  const [query, setQuery] = useSearchParams();
  const showQuiz = query.get("quiz") === "1" && !!material.quiz;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showVisuals, setShowVisuals] = useState(true);
  const [zoom, setZoom] = useState(100);
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [showQuiz],
  );
  async function update() {
    setError("");
    setBusy(true);
    try {
      const updated = await api<StudentMaterial>(
        `/student-materials/${material.id}/complete`,
        {
          method: "POST",
        },
      );
      setMaterial(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("이 브라우저에서는 읽어 주기를 지원하지 않아요.");
      return;
    }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "ko-KR";
    speech.onerror = () =>
      setError(
        "읽어 주기를 실행하지 못했어요. 브라우저의 한국어 음성 설정을 확인해 주세요.",
      );
    window.speechSynthesis.speak(speech);
  }
  return (
    <>
      <Link className="back-link" to="/app/materials">
        <ArrowLeft size={16} />
        나의 수업 자료
      </Link>
      <PageHeading
        eyebrow={`${material.subject}${material.unit ? ` · ${material.unit}` : ""} · 나만의 학습 자료`}
        title={material.title}
        description={
          showQuiz
            ? "배운 내용을 떠올리며 풀어 보세요. 정답과 해설은 제출한 뒤에 확인해요."
            : "문장을 차근차근 읽고, 필요한 설명과 핵심어를 살펴보세요."
        }
      />
      <div className="student-profile-strip">
        <Badge tone={material.result.provider === "solar" ? "blue" : "orange"}>
          {material.result.provider === "solar"
            ? "Solar 재구성"
            : material.result.provider === "original"
              ? "원문 학습 자료"
              : "규칙 기반 데모"}
        </Badge>
        <span>
          {material.profile.level
            ? `생성 당시 진단: ${material.profile.level}수준`
            : "진단 전 · 수준을 추측하지 않아요"}
        </span>
      </div>
      {material.result.notice && <Notice>{material.result.notice}</Notice>}
      {material.quiz && (
        <div
          className="filter-tabs student-reader-tabs"
          aria-label="학습 화면 선택"
        >
          <button
            className={!showQuiz ? "selected" : ""}
            onClick={() => setQuery({})}
          >
            학습 자료
          </button>
          <button
            className={showQuiz ? "selected" : ""}
            onClick={() => setQuery({ quiz: "1" })}
          >
            이해 확인{material.attempt ? " 결과" : ""}
          </button>
        </div>
      )}
      {showQuiz ? (
        <StudentAssessment
          items={material.quiz!.items}
          result={material.attempt}
          submitPath={`/student-materials/${material.id}/quiz/submit`}
          onResult={(attempt) => setMaterial((m) => ({ ...m, attempt }))}
        />
      ) : (
        <>
          <div className="student-reader-tools">
            <label>
              글자 크기
              <select
                aria-label="글자 크기"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[100, 120, 140].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn secondary small"
              onClick={() =>
                speak(
                  material.result.sentences.map((s) => s.rewritten).join("\n"),
                )
              }
            >
              <Volume2 size={16} />
              읽어 주기
            </button>
            <button
              className="btn secondary small"
              onClick={() => window.speechSynthesis?.cancel()}
            >
              읽기 멈춤
            </button>
          </div>
          <section
            className="panel student-reading"
            aria-label="재구성한 학습 자료"
            style={{ fontSize: `${zoom}%` }}
          >
            <h2>함께 읽어 봐요</h2>
            {material.result.sentences.map((s) => (
              <div className="student-sentence" key={s.id}>
                <p>{s.rewritten}</p>
                <details>
                  <summary>원문과 비교하기</summary>
                  <p>{s.source}</p>
                </details>
              </div>
            ))}
          </section>
          {!!material.result.vocabulary.length && (
            <section className="student-vocabulary" aria-label="핵심어">
              <h2>핵심어를 알아봐요</h2>
              <div className="student-vocabulary-grid">
                {material.result.vocabulary.map((v, i) => (
                  <article className="panel" key={`${v.term}-${i}`}>
                    <div className="section-title">
                      <h3>{v.term}</h3>
                      <button
                        className="icon-btn"
                        aria-label={`${v.term} 발음 듣기`}
                        onClick={() => speak(v.term)}
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>
                    {v.simple_meaning && <p>{v.simple_meaning}</p>}
                    {v.translation && (
                      <p className="student-term-translation">
                        {v.translation}
                      </p>
                    )}
                    {!v.translation && !material.profile.native_language && (
                      <small className="muted">
                        모국어 정보가 없어 번역을 추가하지 않았어요.
                      </small>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {!!material.result.visual_aids.length && (
            <section className="student-visuals">
              <div className="section-title">
                <h2>구조를 한눈에</h2>
                <button
                  className="btn secondary small"
                  onClick={() => setShowVisuals(!showVisuals)}
                >
                  {showVisuals ? "시각 자료 숨기기" : "시각 자료 보기"}
                </button>
              </div>
              {showVisuals &&
                material.result.visual_aids.map((v, i) => (
                  <article className="panel" key={i}>
                    <h3>{v.title}</h3>
                    <p>{v.description}</p>
                    {v.kind === "sequence" ? (
                      <ol>
                        {v.items.map((item, n) => (
                          <li key={n}>{item}</li>
                        ))}
                      </ol>
                    ) : (
                      <ul>
                        {v.items.map((item, n) => (
                          <li key={n}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
            </section>
          )}
          <details className="panel student-source">
            <summary>수업 자료 원문 전체 보기</summary>
            <p>{material.source_text}</p>
          </details>
          <section
            className="panel student-completion"
            aria-label="학습 완료와 이해 확인"
          >
            <h2>
              {material.completed_at
                ? "학습을 마쳤어요!"
                : "오늘의 자료를 다 읽었나요?"}
            </h2>
            {!material.completed_at ? (
              <>
                <p>
                  내용을 충분히 살펴봤다면 학습 완료를 눌러 주세요. 이해 확인은
                  그다음에 선택할 수 있어요.
                </p>
                <button className="btn" disabled={busy} onClick={update}>
                  <CheckCircle2 size={18} />
                  {busy ? "저장 중…" : "학습 완료"}
                </button>
              </>
            ) : material.quiz ? (
              <>
                <p>원할 때 이해 확인 문항과 풀이 결과를 다시 볼 수 있어요.</p>
                <button className="btn" onClick={() => setQuery({ quiz: "1" })}>
                  <ClipboardCheck size={18} />
                  {material.attempt
                    ? "이해 확인 결과 보기"
                    : "이해 확인 이어 풀기"}
                </button>
                <StudentPracticeGenerator
                  sourceKind="student_material"
                  sourceId={material.id}
                  title={material.title}
                />
              </>
            ) : (
              <>
                <p>
                  원하면 방금 배운 내용으로 문항을 만들 수 있어요. 이 결과는
                  한국어 진단 수준을 바꾸지 않아요.
                </p>
                <StudentPracticeGenerator
                  sourceKind="student_material"
                  sourceId={material.id}
                  title={material.title}
                />
                <Link className="student-later" to="/app/materials">
                  오늘은 여기까지 할래요
                </Link>
              </>
            )}
          </section>
        </>
      )}
      {error && (
        <div role="alert">
          <Notice>{error}</Notice>
        </div>
      )}
    </>
  );
}
