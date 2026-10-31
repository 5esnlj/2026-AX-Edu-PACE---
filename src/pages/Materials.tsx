import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Image,
  Languages,
  LoaderCircle,
  Minus,
  PencilLine,
  Plus,
  Printer,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, useResource, useAgentHealth } from "../api";
import { SolarConnection } from "./SolarConnection";
import { StudentMaterialList } from "./StudentMaterials";
import { TeacherL1Review } from "./TeacherL1";
import {
  CIVIL_TRIAL_TITLE,
  CivilTrialCard,
  CivilTrialLoader,
  SourcePdfPreview,
  SupportedReading,
  type CivilTrialExample,
} from "./ReconstructionSupport";
import { ConvertPage, isCivilVariant } from "../convert/ConvertPage";
import { toL1Edits, type L1Edits } from "../l1";
import {
  Avatar,
  Badge,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeading,
  SectionTitle,
  Stepper,
  useToast,
} from "../components";
import { useSession } from "../session";
import {
  languages,
  studentLevelLabel,
  type Material,
  type Student,
  type Variant,
} from "../types";

const statusLabels = {
  draft: "검토 대기",
  reviewed: "검토 완료",
  published: "배포 완료",
};

export function Materials() {
  const { user } = useSession();
  const { data, error, loading, reload } =
    useResource<Material[]>("/materials");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("전체");
  const teacher = user!.role === "teacher";
  const visibleMaterials = (data || []).filter(
    (m) =>
      (subject === "전체" || m.subject === subject) && m.title.includes(search),
  );
  const showCivilExample =
    teacher &&
    (subject === "전체" || subject === "사회") &&
    CIVIL_TRIAL_TITLE.includes(search);
  if (error) return <ErrorState message={error} retry={reload} />;
  return (
    <>
      <PageHeading
        eyebrow="배움을 잇는 자료실"
        title={teacher ? "우리 반 수업 자료" : "나의 수업 자료"}
        description={
          teacher
            ? "하나의 수업 자료를, 학생마다 편안한 배움으로 바꿔요."
            : "선생님이 준비한 자료와 내가 직접 재구성한 자료로 함께 배워요."
        }
        action={
          teacher ? (
            <div className="material-actions">
              <Link className="btn" to="/app/create">
                <Plus size={18} />
                맞춤 자료 만들기
              </Link>
              <Link
                className="btn secondary translation-action"
                to="/app/materials/translation-review"
              >
                <Languages size={18} />
                오역 탐지
              </Link>
              <a className="btn secondary" href="/convert/view.html?view=make">
                변환 예시 (민사 재판)
              </a>
            </div>
          ) : (
            <Link className="btn" to="/app/my-materials/create">
              <Plus size={18} />내 자료 재구성하기
            </Link>
          )
        }
      />
      <div className="toolbar">
        <div className="filter-tabs">
          {["전체", "사회", "과학", "수학", "국어"].map((s) => (
            <button
              key={s}
              className={subject === s ? "selected" : ""}
              onClick={() => setSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="수업 자료 검색"
            placeholder="자료 제목 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!teacher && (
        <>
          <StudentMaterialList search={search} subject={subject} />
          <SectionTitle title="선생님이 보내 준 자료" />
        </>
      )}
      {loading ? (
        <Loading />
      ) : (
        <div className="material-grid">
          {showCivilExample && <CivilTrialCard />}
          {visibleMaterials.map((m) => (
            <Link
              key={m.id}
              to={`/app/materials/${m.id}`}
              className="material-card"
            >
              <div className={`material-cover cover-${m.subject}`}>
                <div className="cover-caption">가나다계단 CLASSROOM</div>
                <div className="cover-art">
                  <BookOpen size={48} />
                  <span>✦</span>
                </div>
                <span>
                  {m.subject} · {m.unit || "맞춤 학습"}
                </span>
              </div>
              <div className="material-card-body">
                <div className="section-title">
                  {m.id.startsWith("self-") ? (
                    <Badge tone="neutral">
                      {teacher ? "학생 자기주도" : "내가 넣은 자료"}
                    </Badge>
                  ) : (
                    <Badge tone={m.status === "published" ? "green" : "orange"}>
                      {statusLabels[m.status]}
                    </Badge>
                  )}
                  <small>{m.subject}</small>
                </div>
                <h2>{m.title}</h2>
                <p>
                  {teacher
                    ? `${m.targets.length}명에게 준비한 수준별 자료`
                    : "나에게 맞춘 읽기 자료"}
                </p>
                <div className="material-card-footer">
                  <span>
                    <Languages size={14} />
                    쉬운 한국어와 교과어
                  </span>
                  <ArrowRight size={18} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!loading && !showCivilExample && !visibleMaterials.length && (
        <Empty
          title={
            teacher
              ? "아직 자료가 없어요"
              : "선생님이 보내 준 자료가 아직 없어요"
          }
          description="검색 조건을 바꾸거나 새로운 맞춤 자료를 만들어 보세요."
          action={
            teacher && (
              <Link to="/app/create" className="btn">
                자료 만들기
              </Link>
            )
          }
        />
      )}
    </>
  );
}

export function CreateMaterial() {
  const [query] = useSearchParams();
  const { data: agent } = useAgentHealth();
  const { data: students, error, reload } = useResource<Student[]>("/students");
  const sample = useResource<{ sample_text: string }>("/demo");
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [subject, setSubject] = useState("사회");
  const [source, setSource] = useState("");
  const [targets, setTargets] = useState<string[]>(["std-1", "std-2"]);
  const [modes, setModes] = useState(["easy", "bilingual", "visual"]);
  const [useL1, setUseL1] = useState(true);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  function useExample() {
    setSource(sample.data?.sample_text || "");
    setTitle("민주주의, 우리 함께 만들어 가요");
    setUnit("민주주의와 시민 참여");
    setSubject("사회");
    setFilename("가나다계단 예제 자료");
  }
  function useCivilExample(example: CivilTrialExample) {
    setSource(example.source_text);
    setTitle(example.title);
    setUnit(example.unit);
    setSubject(example.subject);
    setFilename("민사 재판 원본 PDF · 210~211쪽");
    setUseL1(true);
    toast("민사 재판 예시를 불러왔어요. 원문과 학생을 확인해 주세요.");
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast("10MB 이하의 PDF를 올려 주세요.", true);
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const result = await api<{ text: string; filename: string }>("/extract", {
        method: "POST",
        body: form,
      });
      setSource(result.text);
      setFilename(result.filename);
      if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));
      toast("PDF 텍스트를 가져왔어요. 추출 내용을 확인해 주세요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setUploading(false);
    }
  }
  async function generate() {
    setBusy(true);
    try {
      const item = await api<Material>("/materials", {
        method: "POST",
        body: JSON.stringify({
          title,
          subject,
          unit,
          source_text: source,
          targets,
          modes,
          workflow: useL1 ? "teacher_l1" : "standard",
        }),
      });
      navigate(`/app/materials/${item.id}`);
      toast("학생별 자료를 준비했어요. 모든 자료를 검토한 뒤 배포해 주세요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!students) return <Loading />;
  return (
    <>
      <Link to="/app/materials" className="back-link">
        <ArrowLeft size={16} />
        수업 자료로 돌아가기
      </Link>
      <PageHeading
        eyebrow="모두에게 닿는 수업"
        title="맞춤 수업 자료 만들기"
        description="원본의 핵심 개념은 지키고, 한국어의 문턱은 낮춰요."
      />
      <SolarConnection />
      <Stepper step={step} />
      <div className="editor-layout">
        <div>
          {step === 1 ? (
            <>
              <section className="panel form-panel">
                <SectionTitle title="01. 어떤 자료로 배울까요?" />
                <CivilTrialLoader
                  onUse={useCivilExample}
                  students={students}
                  initiallyOpen={query.get("example") === "civil-trial"}
                />
                <div className="form-row">
                  <label className="field">
                    교과
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      {["사회", "과학", "수학", "국어"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field grow">
                    단원
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="예: 민주주의와 시민 참여"
                      maxLength={100}
                    />
                  </label>
                </div>
                <label className="field">
                  자료 제목 <span className="required">필수</span>
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="학생에게 보여 줄 제목을 적어 주세요"
                  />
                </label>
                <label
                  className={`upload-zone ${uploading ? "busy" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault();
                    if (!uploading) void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={uploading}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {uploading ? (
                    <LoaderCircle className="spin" size={28} />
                  ) : (
                    <UploadCloud size={30} />
                  )}
                  <strong>
                    {uploading
                      ? "PDF에서 텍스트를 가져오고 있어요…"
                      : filename || "수업 PDF를 선택하거나 여기에 놓아 주세요"}
                  </strong>
                  <small>
                    텍스트 PDF · 최대 10MB, 50쪽 · 스캔본 OCR은 미연결
                  </small>
                  <span className="btn secondary small">PDF 파일 선택</span>
                </label>
                <div className="section-title source-label">
                  <h3>또는 텍스트를 붙여 넣어 주세요</h3>
                  <button
                    className="text-link"
                    onClick={useExample}
                    disabled={!sample.data}
                  >
                    예제 불러오기
                    <Sparkles size={14} />
                  </button>
                </div>
                <label className="field">
                  <span className="sr-only">원본 수업 자료 텍스트</span>
                  <textarea
                    className="source-textarea"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    maxLength={40000}
                    placeholder="20자 이상의 수업 내용을 넣어 주세요. 원본은 자료와 함께 보존됩니다."
                  />
                  <small>
                    {source.length.toLocaleString()} / 40,000자 · 원본과 추출
                    결과를 비교해 주세요
                  </small>
                </label>
              </section>
              <section className="panel form-panel">
                <SectionTitle title="02. 누구와 함께 배울까요?">
                  <button
                    className="text-link"
                    onClick={() =>
                      setTargets(
                        targets.length === students.length
                          ? []
                          : students.map((s) => s.id),
                      )
                    }
                  >
                    {targets.length === students.length
                      ? "선택 해제"
                      : "전체 선택"}
                  </button>
                </SectionTitle>
                <div className="student-select-grid">
                  {students.map((s, i) => (
                    <label
                      key={s.id}
                      className={`student-check ${targets.includes(s.id) ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={targets.includes(s.id)}
                        onChange={(e) =>
                          setTargets(
                            e.target.checked
                              ? [...targets, s.id]
                              : targets.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <Avatar name={s.name} index={i} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {languages[s.language]} · 읽기{" "}
                          {studentLevelLabel(s, "reading")}
                        </small>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="panel form-panel">
              <SectionTitle
                title={
                  useL1
                    ? "L1 에이전트가 지원을 계획해요"
                    : "어떤 도움을 더할까요?"
                }
                detail={
                  useL1
                    ? "등록한 학생 프로필·교과·원문을 바탕으로 필요한 지원을 자동으로 고릅니다."
                    : "선택한 지원을 학생의 읽기 수준과 주 사용 언어에 맞춰 조합해요."
                }
              />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={useL1}
                  onChange={(e) => setUseL1(e.target.checked)}
                />
                교사용 L1 재구성 에이전트 사용
              </label>
              {useL1 ? (
                <div className="l1-card">
                  <p>
                    쉬운 한국어·모국어 병기·시각 자료의 필요성을 학생별로
                    판단합니다. 핵심 교과 개념어는 유지하고, 문장별 재구성
                    이유를 제공합니다.
                  </p>
                  <p>
                    상세 프로필이 없으면 기존 앱 기록을 참고하며, 확인되지 않은
                    진단 단계·어휘 위계는 추정하지 않습니다.
                  </p>
                  <Link className="text-link" to="/app/students">
                    학생 관리에서 L1 진단 프로필 등록하기
                  </Link>
                </div>
              ) : (
                <div className="mode-options">
                  {[
                    {
                      id: "easy",
                      icon: BookOpen,
                      title: "쉬운 한국어",
                      desc: "긴 문장을 풀고, 익숙한 낱말로 바꿔요.",
                    },
                    {
                      id: "bilingual",
                      icon: Languages,
                      title: "핵심 교과어 병기",
                      desc: "교과어 옆에 학생의 주 사용 언어를 함께 보여요.",
                    },
                    {
                      id: "visual",
                      icon: Image,
                      title: "시각 개념 카드",
                      desc: "교과어와 쉬운 뜻을 카드로 연결해요. 이미지 생성은 미연결이에요.",
                    },
                  ].map((m) => (
                    <label
                      key={m.id}
                      className={`mode-option ${modes.includes(m.id) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={modes.includes(m.id)}
                        onChange={(e) =>
                          setModes(
                            e.target.checked
                              ? [...modes, m.id]
                              : modes.filter((id) => id !== m.id),
                          )
                        }
                      />
                      <m.icon size={27} />
                      <div>
                        <h3>{m.title}</h3>
                        <p>{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <Notice>
                {agent?.provider === "solar"
                  ? agent.configured
                    ? "Solar로 원문을 학생에게 맞춰 재구성합니다. 원문·선택 교과·학습 지원 프로필이 Upstage로 전송됩니다. 생성에는 시간이 걸릴 수 있으며 API 사용료가 발생할 수 있습니다."
                    : "Solar API 키가 아직 설정되지 않았습니다. 서버 설정 후 다시 실행해 주세요."
                  : agent
                    ? useL1
                      ? "L1 검토 흐름을 위한 데모입니다. 원문과 내장 예시 교과어를 사용하며, 실제 재구성에는 Solar 설정이 필요합니다."
                      : "규칙 기반 데모입니다. 정치 단원 예제에는 준비된 쉬운 글을 사용하며, 다른 자료는 제한적인 낱말 치환만 수행합니다."
                    : "AI 설정을 확인하고 있습니다."}
              </Notice>
              <div className="selection-summary">
                <h3>선택한 학생 {targets.length}명</h3>
                {students
                  .filter((s) => targets.includes(s.id))
                  .map((s) => (
                    <Badge key={s.id} tone="neutral">
                      {s.name} · {languages[s.language]} ·{" "}
                      {studentLevelLabel(s, "reading")}
                    </Badge>
                  ))}
              </div>
            </section>
          )}
          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() =>
                step === 1 ? navigate("/app/materials") : setStep(1)
              }
              disabled={busy}
            >
              {step === 1 ? "취소" : "이전으로"}
            </button>
            {step === 1 ? (
              <button
                className="btn"
                disabled={
                  source.trim().length < 20 ||
                  !title.trim() ||
                  !targets.length ||
                  uploading
                }
                onClick={() => setStep(2)}
              >
                지원 방식 선택
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn"
                disabled={busy || (!useL1 && !modes.length)}
                onClick={generate}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Sparkles size={17} />
                )}
                {busy ? "학생별 자료를 만들고 있어요…" : "학생별 자료 생성"}
              </button>
            )}
          </div>
        </div>
        <aside className="editor-aside">
          <div className="panel">
            <span className="aside-illustration">✦</span>
            <h3>같은 수업, 다른 디딤돌</h3>
            <p>
              학생의 영역별 한국어 수준을 바탕으로, 같은 개념에 다가가는 방법을
              달리해요.
            </p>
            <hr />
            <div className="aside-check">
              <Check size={16} />
              원본의 교과 개념 보존
            </div>
            <div className="aside-check">
              <Check size={16} />
              핵심어의 주 사용 언어 병기
            </div>
            <div className="aside-check">
              <Check size={16} />
              교사 검토 후에만 배포
            </div>
          </div>
          <Notice>
            실제 학생의 개인정보나 민감한 수업 자료는 데모에 업로드하지 마세요.
          </Notice>
        </aside>
      </div>
    </>
  );
}

export function MaterialDetail() {
  const { id } = useParams();
  const { user } = useSession();
  const { data, loading, error, reload } = useResource<Material>(
    `/materials/${id}`,
  );
  const roster = useResource<Student[]>(
    user!.role === "teacher" ? "/students" : null,
  );
  if (error || roster.error)
    return (
      <ErrorState
        message={error || roster.error}
        retry={() => {
          reload();
          roster.reload();
        }}
      />
    );
  if (loading || !data || (user!.role === "teacher" && !roster.data))
    return <Loading />;
  return user!.role === "teacher" ? (
    <ReviewMaterial key={data.id} initial={data} students={roster.data!} />
  ) : (
    <Reader key={data.id} item={data} />
  );
}

function ReviewMaterial({
  initial,
  students,
}: {
  initial: Material;
  students: Student[];
}) {
  const [item, setItem] = useState(initial);
  const [active, setActive] = useState(item.targets[0]);
  const [edits, setEdits] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(item.variants).map(([id, v]) => [id, v.text]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [l1Edits, setL1Edits] = useState<Record<string, L1Edits>>(
    Object.fromEntries(
      Object.entries(item.variants)
        .filter(([, v]) => v.reconstruction)
        .map(([id, v]) => [id, toL1Edits(v.reconstruction!)]),
    ),
  );
  const [translations, setTranslations] = useState<
    Record<string, Record<string, string>>
  >(
    Object.fromEntries(
      Object.entries(item.variants).map(([id, v]) => [
        id,
        Object.fromEntries(v.terms.map((t) => [t.term, t.translation])),
      ]),
    ),
  );
  const isReviewed = (id: string) =>
    item.reviewed.includes(id) &&
    (item.variants[id].reconstruction
      ? JSON.stringify(l1Edits[id]) ===
        JSON.stringify(toL1Edits(item.variants[id].reconstruction!))
      : edits[id] === item.variants[id].text &&
        item.variants[id].terms.every(
          (t) => translations[id][t.term] === t.translation,
        ));
  const toast = useToast();
  const variant = item.variants[active];
  const published = item.status === "published";
  const allReviewed = item.targets.every(isReviewed);
  async function review(approve: boolean) {
    setBusy(true);
    try {
      const result = await api<Material>(`/materials/${item.id}/review`, {
        method: "PATCH",
        body: JSON.stringify(
          variant.reconstruction
            ? {
                student_id: active,
                confirmed: approve,
                reconstruction_edits: l1Edits[active],
              }
            : {
                student_id: active,
                text: edits[active],
                confirmed: approve,
                translations: translations[active],
              },
        ),
      });
      setItem(result);
      if (result.variants[active].reconstruction)
        setL1Edits((current) => ({
          ...current,
          [active]: toL1Edits(result.variants[active].reconstruction!),
        }));
      setConfirmed(false);
      toast(
        approve
          ? "이 학생의 자료 검토를 저장했어요."
          : "수정 내용을 저장했어요. 검토 완료 후 배포할 수 있습니다.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      setItem(
        await api<Material>(`/materials/${item.id}/publish`, {
          method: "POST",
        }),
      );
      toast("자료를 학생 교실에 배포했어요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function makeQuiz() {
    setBusy(true);
    try {
      await api(`/materials/${item.id}/quiz`, { method: "POST" });
      toast(
        "이해 확인 문항이 준비되었어요. 학생의 이해 확인 메뉴에 표시됩니다.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/app/materials">
        <ArrowLeft size={16} />
        수업 자료 목록
      </Link>
      <PageHeading
        eyebrow={`${item.subject} · ${item.unit}`}
        title={item.title}
        description="학생별 재구성 결과와 번역을 확인하고, 필요한 내용을 직접 수정해 주세요."
        action={
          <Badge tone={published ? "green" : "orange"}>
            {statusLabels[item.status]}
          </Badge>
        }
      />
      {!published && <Stepper step={3} />}
      <p>
        <Link
          className="text-link"
          to={`/app/materials/translation-review?material=${item.id}`}
        >
          이 자료의 오역 탐지 (L2) 열기
        </Link>
      </p>
      <div className="review-controls">
        <div className="variant-tabs" aria-label="학생별 자료 선택">
          {item.targets.map((id) => {
            const s = students.find((s) => s.id === id)!;
            return (
              <button
                key={id}
                className={active === id ? "active" : ""}
                disabled={busy}
                onClick={() => {
                  setActive(id);
                  setConfirmed(false);
                }}
              >
                {s.name}
                <small>
                  {item.variants[id].native_language || languages[s.language]}
                </small>
                {isReviewed(id) && <CheckCircle2 size={15} />}
              </button>
            );
          })}
        </div>
        <button className="btn secondary small" onClick={() => window.print()}>
          <Printer size={15} />
          인쇄·PDF
        </button>
      </div>
      <Notice>
        {variant.notice} 저자원 언어를 포함한 번역은 전문 검수되지 않았습니다.
        모든 학생의 번역과 글을 확인해야 배포할 수 있습니다.
      </Notice>
      <div
        className={
          isCivilVariant(variant) ? "review-grid cv-single" : "review-grid"
        }
      >
        {!isCivilVariant(variant) && (
          <section className="panel">
            <SectionTitle title="원본 자료">
              <Badge tone="neutral">원본 보존</Badge>
            </SectionTitle>
            {(variant.source_pdf_url ||
              variant.reconstruction?.document?.source_pdf_url) && (
              <SourcePdfPreview
                url={
                  (variant.source_pdf_url ||
                    variant.reconstruction?.document?.source_pdf_url)!
                }
              />
            )}
            <div className="original-text">
              {item.source_text.split("\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}
        <section className="panel print-area">
          <SectionTitle
            title={`${students.find((s) => s.id === active)!.name}의 맞춤 자료`}
          >
            <Badge>
              {variant.reconstruction ? "프로필 기반" : "읽기 자료"} ·{" "}
              {variant.native_language || languages[variant.language]}
            </Badge>
          </SectionTitle>
          {isCivilVariant(variant) && (
            <details className="l1-card">
              <summary>원본 지면 변환 예시 보기</summary>
              <p className="muted">
                민사 재판의 원본 지면을 활용한 예시입니다. 여기서 수정한 내용은
                이 브라우저에만 저장됩니다. 실제 배포 자료는 아래 문장별
                편집에서 수정하고 검토 내용을 저장해 주세요.
              </p>
              <ConvertPage
                mode="teacher"
                reading={variant.level}
                lang={variant.language}
                langName={
                  variant.native_language || languages[variant.language]
                }
                name={students.find((s) => s.id === active)!.name}
                storageKey={`ganada-convert:${item.id}:${active}`}
              />
            </details>
          )}
          {variant.reconstruction ? (
            <>
              <TeacherL1Review
                data={variant.reconstruction}
                edits={l1Edits[active]}
                readOnly={published || busy}
                onChange={(next) => {
                  setL1Edits({ ...l1Edits, [active]: next });
                  setConfirmed(false);
                }}
              />
              <details className="l1-card">
                <summary>저장된 학생용 자료 미리보기</summary>
                {!published && (
                  <p className="muted">
                    수정 후 ‘검토 내용 저장’을 누르면 미리보기에 반영됩니다.
                  </p>
                )}
                <div className="original-text">
                  <SupportedReading
                    text={variant.text}
                    support={variant.reading_support}
                  />
                </div>
                <ConceptCards variant={variant} />
              </details>
            </>
          ) : (
            <>
              <label className="field">
                <span className="sr-only">학생별 쉬운 글 수정</span>
                <textarea
                  className="review-text"
                  readOnly={published}
                  value={edits[active]}
                  onChange={(e) => {
                    setEdits({ ...edits, [active]: e.target.value });
                    setConfirmed(false);
                  }}
                  maxLength={40000}
                />
              </label>
              <div className="print-text">{edits[active]}</div>
              <ConceptCards variant={variant} />
              <div className="term-review">
                <h3>
                  <Languages size={17} />
                  교과어 병기 · 검토 필요
                </h3>
                {variant.terms.map((t) => (
                  <div key={t.term}>
                    <strong>{t.term}</strong>
                    {published ? (
                      <span>{t.translation}</span>
                    ) : (
                      <label className="translation-field">
                        <span className="sr-only">{t.term} 번역 수정</span>
                        <input
                          value={translations[active][t.term]}
                          maxLength={300}
                          onChange={(e) => {
                            setTranslations({
                              ...translations,
                              [active]: {
                                ...translations[active],
                                [t.term]: e.target.value,
                              },
                            });
                            setConfirmed(false);
                          }}
                        />
                      </label>
                    )}
                    <Badge tone="orange">예시 대역</Badge>
                  </div>
                ))}
                {!variant.terms.length && (
                  <p>선택한 방식·대역표에서 병기할 교과어가 없습니다.</p>
                )}
              </div>
            </>
          )}
          {!published && (
            <div className="review-confirm">
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                원본의 의미·학생 수준·교과어 번역을 확인했어요.
              </label>
              <button
                className="btn secondary full"
                disabled={
                  busy ||
                  !confirmed ||
                  (!variant.reconstruction &&
                    (edits[active].trim().length < 10 ||
                      Object.values(translations[active]).some(
                        (v) => !v.trim(),
                      )))
                }
                onClick={() => review(true)}
              >
                <ShieldCheck size={17} />이 학생의 검토 완료
              </button>
              {variant.reconstruction && (
                <button
                  className="btn secondary full"
                  disabled={busy}
                  onClick={() => review(false)}
                >
                  검토 내용 저장 (승인 보류)
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      <div className="form-actions">
        <p>
          {published
            ? `${item.targets.length}명의 학생 교실에 배포되었어요.`
            : `${item.targets.filter(isReviewed).length} / ${item.targets.length}명 검토 완료`}
        </p>
        {published ? (
          <button className="btn" disabled={busy} onClick={makeQuiz}>
            <ClipboardIcon />
            이해 확인 문항 만들기
          </button>
        ) : (
          <button
            className="btn"
            disabled={busy || !allReviewed}
            onClick={publish}
          >
            <Send size={17} />
            학생에게 배포하기
          </button>
        )}
      </div>
    </>
  );
}

function ClipboardIcon() {
  return <FileText size={17} />;
}
function ConceptCards({ variant }: { variant: Variant }) {
  return (
    !!variant.visuals.length && (
      <div className="concept-cards">
        {variant.visuals.map((v, i) => {
          const content = (
            <>
              <span>{["◉", "✳", "✦", "⌁"][i % 4]}</span>
              <strong>{v.term}</strong>
              <p>{v.meaning}</p>
              {!!v.items?.length &&
                (v.kind === "sequence" ? (
                  <ol aria-label={v.alt_text}>
                    {v.items.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ol>
                ) : (
                  <ul aria-label={v.alt_text}>
                    {v.items.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                ))}
            </>
          );
          return v.visible_by_default === false ? (
            <details
              key={v.term}
              className={`concept-card concept-${i} folded-visual`}
            >
              <summary>그림으로 보기 · {v.term}</summary>
              {content}
            </details>
          ) : (
            <div key={v.term} className={`concept-card concept-${i}`}>
              {content}
            </div>
          );
        })}
      </div>
    )
  );
}

type Learning = { notes: string; known: string[]; unknown: string[] };
function Reader({ item }: { item: Material }) {
  const { user } = useSession();
  const resource = useResource<Learning>(`/learning/${item.id}`);
  if (resource.error)
    return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  return (
    <ReaderContent
      item={item}
      initial={resource.data}
      studentId={user!.student!.id}
    />
  );
}
function ReaderContent({
  item,
  initial,
  studentId,
}: {
  item: Material;
  initial: Learning;
  studentId: string;
}) {
  const [learning, setLearning] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const [pictures, setPictures] = useState(true);
  const [original, setOriginal] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const variant = item.variants[studentId];
  const text = original ? item.source_text : variant.text;
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [],
  );
  function update(next: Learning) {
    setLearning(next);
    setDirty(true);
  }
  function word(term: string, kind: "known" | "unknown") {
    const other = kind === "known" ? "unknown" : "known";
    update({
      ...learning,
      [other]: learning[other].filter((w) => w !== term),
      [kind]: learning[kind].includes(term)
        ? learning[kind].filter((w) => w !== term)
        : [...learning[kind], term],
    });
  }
  async function save() {
    setBusy(true);
    try {
      await api(`/learning/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(learning),
      });
      setDirty(false);
      toast("단어장과 나의 메모를 저장했어요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function speak() {
    if (!window.speechSynthesis) {
      toast("이 브라우저는 읽어주기를 지원하지 않아요.", true);
      return;
    }
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.85;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      toast(
        "음성 재생에 실패했어요. 브라우저 음성 지원을 확인해 주세요.",
        true,
      );
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  return (
    <>
      <Link className="back-link" to="/app/materials">
        <ArrowLeft size={16} />
        나의 수업 자료
      </Link>
      <PageHeading
        eyebrow={`${item.subject} · ${item.unit}`}
        title={item.title}
        description="모르는 말이 있어도 괜찮아요. 천천히, 함께 읽어 봐요."
        action={
          <Badge>
            {variant.native_language ? "맞춤 읽기" : "읽기 자료"} ·{" "}
            {variant.native_language || languages[variant.language]}
          </Badge>
        }
      />
      <div className="reader-toolbar">
        <button
          className={`btn secondary small ${speaking ? "selected" : ""}`}
          onClick={speak}
        >
          {speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}{" "}
          {speaking ? "읽기 멈추기" : "소리 내어 읽기"}
        </button>
        <div className="zoom-controls">
          <button
            className="icon-btn"
            aria-label="글자 줄이기"
            disabled={zoom <= 0.9}
            onClick={() => setZoom((z) => Math.max(0.9, z - 0.1))}
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-btn"
            aria-label="글자 키우기"
            disabled={zoom >= 1.6}
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          className="btn secondary small"
          aria-pressed={pictures}
          onClick={() => setPictures(!pictures)}
        >
          <Image size={16} />
          {pictures ? "개념 카드 숨기기" : "개념 카드 보기"}
        </button>
        <button
          className="btn secondary small"
          aria-pressed={original}
          onClick={() => {
            window.speechSynthesis?.cancel();
            setSpeaking(false);
            setOriginal(!original);
          }}
        >
          <Eye size={16} />
          {original ? "쉬운 글 보기" : "원본 보기"}
        </button>
        <button
          className="icon-btn"
          aria-label="인쇄 및 PDF 저장"
          onClick={() => window.print()}
        >
          <Printer size={18} />
        </button>
      </div>
      <div className="reader-layout">
        <article className="reading-sheet print-area">
          <div className="reading-label">
            <span>오늘의 배움</span>
            <BookOpen size={19} />
          </div>
          <h2>{item.unit || item.title}</h2>
          {variant.source_pdf_url && (
            <SourcePdfPreview url={variant.source_pdf_url} />
          )}
          <div className="reading-body" style={{ fontSize: `${zoom * 19}px` }}>
            <SupportedReading
              key={`${original}-${variant.text}`}
              text={text}
              support={original ? [] : variant.reading_support}
            />
          </div>
          {pictures && <ConceptCards variant={variant} />}
          {isCivilVariant(variant) && (
            <details className="l1-card">
              <summary>원본 지면 변환 예시 보기</summary>
              <p className="muted">
                원본 지면을 활용한 참고 예시예요. 선생님이 검토해 보내 준 학습
                자료는 위의 글에서 읽어 주세요.
              </p>
              <ConvertPage
                mode="student"
                reading={variant.level}
                lang={variant.language}
                langName={
                  variant.native_language || languages[variant.language]
                }
                name=""
                storageKey={`ganada-convert:${item.id}:${studentId}`}
                scale={zoom}
                showOriginal={original}
                known={learning.known}
                onWord={(t, kind) => {
                  if (!learning[kind].includes(t)) word(t, kind);
                }}
              />
            </details>
          )}
          <div className="reading-bottom">
            작은 이해가 모여, 큰 배움이 되어요. <span>✦</span>
          </div>
        </article>
        <aside className="reader-notes">
          <section className="panel">
            <SectionTitle title="나의 교과어 사전">
              <Languages size={19} />
            </SectionTitle>
            <p className="muted">낯선 말은 모아 두고, 익숙한 말은 표시해요.</p>
            <div className="reader-terms">
              {variant.terms.map((t) => (
                <div className="reader-term" key={t.term}>
                  <div>
                    <strong>{t.term}</strong>
                    <span>{t.translation}</span>
                  </div>
                  <p>{t.meaning}</p>
                  <div className="word-buttons">
                    <button
                      className={
                        learning.unknown.includes(t.term)
                          ? "selected unknown"
                          : ""
                      }
                      onClick={() => word(t.term, "unknown")}
                      aria-pressed={learning.unknown.includes(t.term)}
                    >
                      더 배울래요
                    </button>
                    <button
                      className={
                        learning.known.includes(t.term) ? "selected" : ""
                      }
                      onClick={() => word(t.term, "known")}
                      aria-pressed={learning.known.includes(t.term)}
                    >
                      <Check size={13} />
                      알고 있어요
                    </button>
                  </div>
                </div>
              ))}
              {!variant.terms.length && <p>이 자료에 병기된 낱말이 없어요.</p>}
            </div>
            <small className="muted">
              예시 번역입니다. 낯선 번역은 선생님과 확인해요.
            </small>
          </section>
          <section className="panel">
            <SectionTitle title="나의 메모">
              <PencilLine size={18} />
            </SectionTitle>
            <label className="field">
              <span className="sr-only">나의 메모</span>
              <textarea
                value={learning.notes}
                maxLength={10000}
                onChange={(e) => update({ ...learning, notes: e.target.value })}
                placeholder="오늘 새롭게 알게 된 것이나 선생님께 묻고 싶은 것을 적어 보세요."
              />
            </label>
            <button
              className="btn full"
              disabled={busy || !dirty}
              onClick={save}
            >
              {busy ? "저장 중…" : "단어장·메모 저장"}
            </button>
            <small className="save-state">
              {dirty
                ? "저장하지 않은 변경 내용이 있어요."
                : "변경 내용은 저장 버튼을 눌러 보관해요."}
            </small>
          </section>
        </aside>
      </div>
      <div className="next-learning">
        <div>
          <h3>잘 읽었어요! 이제 함께 확인해 볼까요?</h3>
          <p>수업에서 배운 내용을 짧은 문제로 만나 보세요.</p>
        </div>
        <Link to="/app/quizzes" className="btn">
          이해 확인하러 가기
          <ArrowRight size={17} />
        </Link>
      </div>
    </>
  );
}
