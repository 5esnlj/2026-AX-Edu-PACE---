import { useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  LoaderCircle,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { api } from "../api";
import { Notice, PageHeading, SectionTitle, useToast } from "../components";
import type { Material } from "../types";

// 자기주도학습: 학생이 스스로 자료(PDF 또는 글)를 넣으면
// 본인 진단 프로필에 맞춰 바로 재구성하고, 읽기 화면으로 열어요.
// 선생님 검토 없이 본인에게만 보이는 자료예요.
export function SelfStudy() {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("사회");
  const [unit, setUnit] = useState("");
  const [source, setSource] = useState("");
  const [filename, setFilename] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

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
      toast("PDF에서 글을 가져왔어요. 아래에서 확인해 보세요.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setUploading(false);
    }
  }

  async function make() {
    setBusy(true);
    try {
      const item = await api<Material>("/my-materials", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          subject,
          unit: unit.trim(),
          source_text: source.trim(),
        }),
      });
      toast("내 수준에 맞게 바꿨어요. 천천히 읽어 보세요.");
      navigate(`/app/materials/${item.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const ready = title.trim() && source.trim().length >= 20;
  return (
    <>
      <Link className="back-link" to="/app/materials">
        <ArrowLeft size={16} />
        나의 수업 자료
      </Link>
      <PageHeading
        eyebrow="스스로 하는 공부"
        title="내 자료로 공부하기"
        description="공부하고 싶은 교과서나 학습지를 넣으면, 내 한국어 수준과 모국어에 맞게 바꿔 줘요."
      />
      <section className="panel form-panel">
        <SectionTitle title="01. 어떤 자료로 공부할까요?" />
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
            단원 (선택)
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="예: 민주주의와 시민 참여"
              maxLength={100}
            />
          </label>
        </div>
        <label className="field">
          자료 이름 <span className="required">필수</span>
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 사회 3단원 복습"
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
              ? "PDF에서 글을 가져오고 있어요…"
              : filename || "PDF를 고르거나 여기에 놓아 주세요"}
          </strong>
          <small>글자가 있는 PDF · 최대 10MB, 50쪽</small>
          <span className="btn secondary small">PDF 파일 고르기</span>
        </label>
        <label className="field">
          <span>또는 글을 붙여 넣어 주세요</span>
          <textarea
            className="source-textarea"
            value={source}
            maxLength={40000}
            rows={10}
            onChange={(e) => setSource(e.target.value)}
            placeholder="교과서 글을 복사해서 붙여 넣어도 돼요 (20자 이상)"
          />
        </label>
        <Notice>
          선생님 확인 없이 바로 만들어져요. 모국어 낱말은 아직 확인 전일 수
          있으니, 헷갈리면 선생님께 물어보세요.
        </Notice>
        <button
          className="btn"
          disabled={!ready || busy || uploading}
          onClick={make}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Wand2 size={17} />
          )}
          {busy ? "내 수준에 맞게 바꾸는 중…" : "내 수준에 맞게 바꾸기"}
          {!busy && <Sparkles size={14} />}
        </button>
      </section>
    </>
  );
}
