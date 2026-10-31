"""Adapted from the supplied teacher workflow; browser review replaces its CLI.

Use only the six-level diagnosis; unknown levels remain missing.
The server owns identities, source links, vocabulary state and approval flags.
"""
import copy
import json
import re
from pathlib import Path

from .models import LearnerProfile, ReconstructionEdits, ReconstructionOutput
from ..agents import GLOSSARY, LANGUAGES
from ..glossary_data import REFERENCE_GLOSSARY
from . import civil_trial

ROOT = Path(__file__).resolve().parent
RULES = json.loads((ROOT / "data/reconstruction_rules.json").read_text(encoding="utf-8"))
LEXICON = json.loads((ROOT / "data/vocabulary_lexicon.json").read_text(encoding="utf-8"))
SYSTEM_PROMPT = (ROOT / "agent_system_prompt.md").read_text(encoding="utf-8")
TIER_CODES = {"1": "B", "2-1": "T1", "2-2": "T2", "2-3": "T3", "3": "C"}
EDITABLE_FIELDS = ["key_sentences.rewritten", "vocabulary.translation", "vocabulary.tier", "vocabulary.simple_meaning", "vocabulary.action", "visual_aids"]


def fallback_profile(student: dict) -> LearnerProfile:
    return LearnerProfile(
        grade=student["grade"], native_language=LANGUAGES.get(student["language"]) if student["language"] != "und" else None,
        level_scale="diagnostic_1_6", skills={k:v or None for k,v in student["levels"].items()},
        # Unknown values are missing; no conversion from the removed four-level scale.
    )


def split_sentences(source: str) -> list[dict]:
    return [{"id": f"s{i}", "source": text.strip()} for i, text in enumerate(
        (t for t in re.split(r"(?<=[.!?。！？])\s+|\n+", source) if t.strip()), 1)]


def source_contexts(source: str) -> list[dict]:
    if civil_trial.matches(source):
        return civil_trial.sentence_contexts(split_sentences)
    return [dict(s, page=None, fixed=bool(re.match(r"^(?:제\s*\d+\s*조|출처\s*[:：]|[‘“\"])", s["source"])), activity=False)
            for s in split_sentences(source)]


def prepare_request(profile: LearnerProfile, source: str, subject: str, title: str,
                    profile_source: str, vocabulary_state: dict | None = None) -> dict:
    safe_profile = profile.model_dump(exclude={"learner_id", "display_name"})
    notes = []
    if not profile.overall_korean_level:
        notes.append("종합 진단이 없어 전체 단계나 상위 어휘를 추정하지 않습니다.")
    if not any(profile.academic_korean.model_dump().values()):
        notes.append("어휘 위계별 진단이 없습니다. 분류와 단순화는 교사 확인이 필요합니다.")
    if not profile.native_language:
        notes.append("모국어가 없어 번역을 생성하지 않습니다. L1 프로필에 모국어를 등록해 주세요.")
    sp = profile.subject_profiles.get(subject)
    if sp and (sp.uncertain or sp.recheck_required or sp.uncertainty_flags):
        notes.append("선택 교과의 진단에 불확실성·재확인 표시가 있습니다. 확정 단계로 사용하지 않습니다.")
    cues = list(dict.fromkeys(re.findall(r"첫째|둘째|셋째|마지막으로|순서|단계|과정|절차|목록|비교|공통점|차이점", source)))
    lexicon = copy.deepcopy(LEXICON)
    registered = {e["term"] for e in lexicon["entries"]}
    lexicon["entries"].extend({"term": e["term"], "translations": e["translations"],
        "verification": REFERENCE_GLOSSARY["verification"], "source": REFERENCE_GLOSSARY["source"]}
        for e in REFERENCE_GLOSSARY["entries"] if e["term"] not in registered)
    lexicon["description"] = "어휘 위계 사전과 이미지 참고 대역을 함께 제공합니다. 이미지에는 위계·숙달도 근거가 없습니다."
    lexicon["translation_languages"] = REFERENCE_GLOSSARY["languages"]
    if any(e["term"] in source for e in REFERENCE_GLOSSARY["entries"]):
        notes.append(REFERENCE_GLOSSARY["notice"])
    example = civil_trial.matches(source)
    if example:
        notes.append(civil_trial.NOTICE)
        registered = {e["term"] for e in lexicon["entries"]}
        lexicon["entries"].extend({"term": e["term"], "translations": e["translations"], "verification": "unreviewed"}
            for e in civil_trial.terms(REFERENCE_GLOSSARY) if e["term"] not in registered)
    return {
        "learner_profile": safe_profile,
        "profile_source": profile_source,
        "profile_notes": notes,
        "subject": subject, "source_name": title, "source_text": source,
        "source_sentences": source_contexts(source),
        "protected_terms": civil_trial.PROTECTED if example else [e["term"] for e in lexicon["entries"] if e["term"] in source],
        "source_pdf_url": civil_trial.PDF_URL if example else None,
        "reference_example": example,
        "source_signals": {"possible_process_or_list": bool(cues), "matched_cues": cues, "note": "문자 기반 참고 신호로, 최종 판단 근거가 아닙니다."},
        "reconstruction_rules": RULES, "vocabulary_lexicon": lexicon,
        "vocabulary_state": vocabulary_state or {},
        "host_capabilities": {"text_pdf": True, "ocr": False, "tts": True, "handwriting": False,
                              "visual_aids": ["sequence", "list", "comparison", "venn", "other"]},
    }


def _validate_source_links(output: dict, request: dict):
    sources = {s["id"]: s["source"] for s in request["source_sentences"]}
    sentences = output["key_sentences"]
    if len({s["id"] for s in sentences}) != len(sentences):
        raise ValueError("중복된 원문 문장 ID가 있습니다.")
    for sentence in sentences:
        if sentence["id"] not in sources or sentence["source"] != sources[sentence["id"]]:
            raise ValueError("재구성 문장의 원문 근거가 입력 자료와 일치하지 않습니다.")
    vocabulary = output["vocabulary"]
    if len({v["term"] for v in vocabulary}) != len(vocabulary):
        raise ValueError("교과어가 중복되었습니다.")
    for term in vocabulary:
        refs = term["source_sentence_ids"]
        if not set(refs) <= sources.keys() or not any(term["term"] in sources[sid] for sid in refs):
            raise ValueError("교과어와 원문 연결을 확인할 수 없습니다.")
    for visual in output["visual_aids"]:
        if not set(visual["source_sentence_ids"]) <= sources.keys():
            raise ValueError("시각 자료의 원문 근거를 확인할 수 없습니다.")


def _check_concept_preservation(output: dict):
    by_id = {s["id"]: s for s in output["key_sentences"]}
    for term in output["vocabulary"]:
        if term["tier"] not in ("2-3", "3"):
            continue
        if term["action"] == "simplify":
            raise ValueError("범용 지식·핵심 교과 개념어는 삭제·대체할 수 없습니다.")
        for sid in term["source_sentence_ids"]:
            sentence = by_id.get(sid)
            if sentence and term["term"] in sentence["source"] and term["term"] not in sentence["rewritten"]:
                raise ValueError("재구성 글에서 핵심 교과 개념어를 유지해 주세요.")


def _apply_swaps(sentence: dict, protected: list[str], limit: int):
    source, edits = sentence["source"], []
    if len(sentence["swaps"]) > limit:
        raise ValueError("문장당 표현 교체 수를 초과했습니다.")
    for swap in sentence["swaps"]:
        original, replacement = swap["original"], swap["replacement"]
        if source.count(original) != 1 or len(replacement) > len(original) * 2:
            raise ValueError("교체 표현은 원문에서 한 위치를 식별하고 원래 길이의 두 배 이하여야 합니다.")
        start, end = source.index(original), source.index(original) + len(original)
        for term in protected:
            for occurrence in re.finditer(re.escape(term), source):
                if start < occurrence.end() and occurrence.start() < end:
                    raise ValueError("교과 개념어와 겹치는 표현은 교체할 수 없습니다.")
        if any(start < b and a < end for a, b, _ in edits):
            raise ValueError("표현 교체 범위가 겹칩니다.")
        edits.append((start, end, replacement))
    text = source
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def _validate_reconstruction(output: dict, request: dict):
    contexts = {s["id"]: s for s in request["source_sentences"]}
    profile = request["learner_profile"]
    band = civil_trial.reading_band(profile)
    limit = 3 if band == "l2" else 2 if band == "l4" else 1
    reference_simplifications = set()
    for sentence in output["key_sentences"]:
        context = contexts[sentence["id"]]
        sentence["fixed"] = context.get("fixed", False)
        sentence["page"] = context.get("page")
        if sentence["fixed"] and (sentence["rewritten"] != sentence["source"] or sentence["swaps"]):
            raise ValueError("법 조문·인용·출처는 원문을 유지하고 별도 설명으로 지원해 주세요.")
        if context.get("activity"):
            sentence["explanation"] = ""  # Do not attach answer-bearing support to activities.
        if sentence["swaps"]:
            sentence["rewritten"] = _apply_swaps(sentence, request["protected_terms"], limit)
            allowed = civil_trial.candidate_swaps(context, profile) if request.get("reference_example") else []
            if all(swap in allowed for swap in sentence["swaps"]):
                reference_simplifications.add(sentence["id"])
        # Protected terms come from server-owned data, not the model's vocabulary list.
        for term in request["protected_terms"]:
            if sentence["rewritten"].count(term) < sentence["source"].count(term):
                raise ValueError("핵심 교과어를 삭제·대체할 수 없습니다. 별도 쉬운 설명으로 지원해 주세요.")
    return reference_simplifications


def _set_review_state(output: dict, confirmed: bool, edited: bool):
    output["status"] = "teacher_approved" if confirmed else "teacher_review_required"
    output["teacher_review"].update(required=not confirmed, teacher_edits_applied=edited, editable_fields=EDITABLE_FIELDS)
    output["finalization"] = {"approved_by_teacher": confirmed, "final_document": None}
    for sentence in output["key_sentences"]:
        sentence["review_required"] = not confirmed
    for term in output["vocabulary"]:
        term["review_required"] = not confirmed


def normalize_output(raw: ReconstructionOutput, request: dict) -> dict:
    output = raw.model_dump()
    _validate_source_links(output, request)
    reference_simplifications = _validate_reconstruction(output, request)
    _check_concept_preservation(output)
    profile = request["learner_profile"]
    decision = output["learner_decision"]
    # A model may suggest methods, but cannot invent diagnosis or change home language.
    decision.update(diagnosed_level=profile["overall_korean_level"], skill_profile=profile["skills"],
                    subject_profile_used=profile["subject_profiles"].get(request["subject"], {}),
                    native_language=profile["native_language"] or "")
    decision["methods_selected"] = list(dict.fromkeys(decision["methods_selected"]))
    if not profile["native_language"]:
        decision["methods_selected"] = [m for m in decision["methods_selected"] if m != "bilingual"]
    output["document"] = {"subject": request["subject"], "source_name": request["source_name"],
                          "grade": profile["grade"] or "", "class_name": "", "source_pdf_url": request["source_pdf_url"]}
    output["warnings"] = list(dict.fromkeys(request["profile_notes"] + output["warnings"]))
    lexicon = {entry["term"]: entry for entry in request["vocabulary_lexicon"]["entries"]}
    simplify_sentences = reference_simplifications
    by_id = {s["id"]: s for s in output["key_sentences"]}
    for term in output["vocabulary"]:
        entry = lexicon.get(term["term"], {})
        tier = entry.get("tier", "unknown_needs_teacher")
        term["tier"] = tier
        # Only comparable numeric levels backed by a lexicon and the 1–6 profile qualify.
        required = entry.get("required_level") if profile["level_scale"] == "diagnostic_1_6" else None
        level = profile["academic_korean"].get(TIER_CODES.get(tier, "")) if required is not None else None
        term["required_level"], term["learner_level"] = required, level
        comparable = type(required) is int and type(level) is int
        if tier == "unknown_needs_teacher":
            term.update(action="review", category="unknown")
        elif comparable and required <= level:
            term["action"] = "retain"
            for sid in term["source_sentence_ids"]:
                sentence = by_id.get(sid)
                if sentence and term["term"] in sentence["source"] and term["term"] not in sentence["rewritten"]:
                    raise ValueError("이미 숙달한 어휘를 삭제·대체한 결과는 저장할 수 없습니다.")
        elif tier in ("2-3", "3"):
            term["action"] = "elaborate"
        elif not comparable and term["action"] == "simplify":
            term["action"] = "review"
        if comparable and required > level and tier in ("2-1", "2-2"):
            simplify_sentences.update(term["source_sentence_ids"])
        term["native_language"] = profile["native_language"] or ""
        if not profile["native_language"] or "bilingual" not in decision["methods_selected"]:
            term.update(translation="", translation_status="missing_profile_data" if not profile["native_language"] else "review")
        elif term["translation"]:
            term["translation_status"] = "review"
        term["knowledge_state"] = request["vocabulary_state"].get(term["term"], "unmarked")
        term["tts_text"] = term["term"]
    if any("simplify" in s["operations"] and s["id"] not in simplify_sentences for s in output["key_sentences"]):
        raise ValueError("위계·진단 근거 없는 어휘 단순화 결과는 저장할 수 없습니다.")
    if any(t["tier"] == "unknown_needs_teacher" for t in output["vocabulary"]):
        output["warnings"].append("사전에 분류 근거가 없는 어휘는 ‘교사 분류 필요’로 표시했습니다. 임의의 숙달 단계는 부여하지 않았습니다.")
    # A text-only provider cannot claim to have inspected PDF pages or performed OCR.
    if output["recognition"]["status"] == "failed":
        raise ValueError("원문 확인에 실패한 재구성 결과는 저장할 수 없습니다.")
    output["recognition"]["page_notes"] = ["첨부 예시의 블록·쪽 연결을 사용했습니다. 일반 PDF 지면 재배치를 수행하지 않습니다." if request.get("reference_example") else "교사가 확인한 추출 텍스트를 사용했습니다. PDF 페이지·OCR 품질은 모델이 검사하지 않았습니다."]
    output["learner_tools"] = {"tts_texts": [v["term"] for v in output["vocabulary"]],
        "vocabulary_states": {v["term"]: v["knowledge_state"] for v in output["vocabulary"]},
        "visual_visibility_default": False, "document_zoom_default_percent": 100, "handwriting_supported_by_host": False}
    _check_concept_preservation(output)
    _set_review_state(output, False, False)
    output["profile_context"] = {"source": request["profile_source"], "level_scale": profile["level_scale"],
        "bottlenecks": profile["bottlenecks"], "daily_korean_support": profile["daily_korean_support"]}
    return output


def render_variant(output: dict, source: str, student: dict, provider: str) -> dict:
    replacements = {s["id"]: s["rewritten"] for s in output["key_sentences"]}
    # Unselected sentences remain in the final material; key-sentence selection is not summarization.
    text = "\n".join(replacements.get(s["id"], s["source"]) for s in split_sentences(source))
    if not 10 <= len(text) <= 40000:
        raise ValueError("최종 재구성 글은 10~40,000자여야 합니다.")
    confirmed = output["finalization"]["approved_by_teacher"]
    output["finalization"]["final_document"] = text if confirmed else None
    language = output["learner_decision"]["native_language"]
    terms = [dict(term=v["term"], meaning=v["simple_meaning"], translation=v["translation"],
                  translations={language: v["translation"]} if language else {}, verified=confirmed, tts_text=v["tts_text"])
             for v in output["vocabulary"]]
    visuals = [dict(term=v["title"], meaning=v["description"], kind=v["kind"], items=v["items"], alt_text=v["alt_text"], visible_by_default=v["visible_by_default"])
               for v in output["visual_aids"] if v["needed"]]
    by_id = {s["id"]: s for s in output["key_sentences"]}
    reading_support = []
    for context in source_contexts(source):
        sentence = by_id.get(context["id"])
        reading_support.append({"id": context["id"], "source": context["source"], "rewritten": sentence["rewritten"] if sentence else context["source"],
            "swaps": sentence.get("swaps", []) if sentence else [], "explanation": sentence.get("explanation", "") if sentence else "",
            "page": context.get("page"), "activity": context.get("activity", False)})
    return {"text": text, "terms": terms, "visuals": visuals, "level": student["levels"]["reading"], "level_scale": "diagnostic_1_6",
        "reading_support": reading_support, "source_pdf_url": output["document"].get("source_pdf_url"),
        "language": student["language"], "native_language": language or "모국어 미등록", "provider": provider,
        "notice": "Solar가 생성한 교사용 L1 재구성 초안입니다. 문장 근거·어휘 분류·번역·시각 자료를 확인해 주세요." if provider == "solar"
                  else "첨부 민사 재판 예시의 규칙 기반 재구성입니다. 표현·설명·번역은 교사 검토 전입니다." if civil_trial.matches(source)
                  else "L1 검토 흐름을 위한 규칙 기반 데모입니다. 원문을 유지하며 실제 AI 재구성은 수행하지 않았습니다.",
        "reconstruction": output}


def demo_output(request: dict) -> ReconstructionOutput:
    sources = request["source_sentences"]
    if len(sources) > 60 or any(len(s["source"]) > 4000 for s in sources):
        raise ValueError("L1 데모에서는 문장 60개 이하, 문장당 4,000자 이하의 원문을 사용해 주세요.")
    language = request["learner_profile"]["native_language"]
    language_labels = {**LANGUAGES, **REFERENCE_GLOSSARY["languages"]}
    code = next((code for code, label in language_labels.items() if label == language), None)
    glossary = GLOSSARY + [{"term": e["term"], "meaning": "", "translations": e["translations"]} for e in REFERENCE_GLOSSARY["entries"]]
    example = request.get("reference_example", False)
    if example:
        glossary = civil_trial.terms(REFERENCE_GLOSSARY)
    vocabulary = [dict(term=t["term"], tier="unknown_needs_teacher", category="unknown",
        source_sentence_ids=[s["id"] for s in sources if t["term"] in s["source"]], action="review",
        simple_meaning=t["meaning"], native_language=language or "", translation=t["translations"].get(code, ""),
        translation_status="review", tts_text=t["term"])
        for t in glossary if t["term"] in request["source_text"]]
    sentences = []
    explained_blocks = set()
    for s in sources:
        swaps = civil_trial.candidate_swaps(s, request["learner_profile"]) if example else []
        explanation = civil_trial.explanation(s, request["learner_profile"]) if example and s["block_id"] not in explained_blocks else ""
        if example:
            explained_blocks.add(s["block_id"])
        sentence = dict(id=s["id"], source=s["source"], rewritten=s["source"], swaps=swaps,
            explanation=explanation, operations=["simplify"] if swaps else ["retain"],
            rationale="첨부 예시의 표현 후보를 교사가 검토합니다. 진단 척도가 다른 기록은 교체 근거로 쓰지 않습니다." if example else "데모에서는 모델 재구성을 수행하지 않아 원문을 유지합니다.")
        sentences.append(sentence)
    methods = (["bilingual"] if language else []) + (["easy", "visual"] if example else [])
    visuals = []
    if example:
        refs = [s["id"] for s in sources if s["block_id"].startswith("st")]
        visuals = [{"needed": True, "kind": "sequence", "title": "민사 재판의 과정", "description": "원문의 다섯 과정 카드를 순서대로 확인해요.",
            "items": [s["source"] for s in sources if s["id"] in refs], "source_sentence_ids": refs, "alt_text": "소장 제출부터 판결까지 민사 재판의 다섯 과정", "visible_by_default": False,
            "rationale": "첨부 예시의 과정 카드 원문을 그대로 사용합니다."}]
    return ReconstructionOutput.model_validate({
        "status": "teacher_review_required", "document": {"subject": request["subject"]},
        "learner_decision": {"native_language": language or "", "methods_selected": methods,
            "rationale": ["첨부 예시의 표현 후보·접힌 설명·과정 카드를 사용합니다. 1~6 읽기 진단이 없으면 표현은 유지합니다." if example else "데모는 원문을 유지하고 내장 예시 교과어만 제공합니다. Solar를 설정하면 프로필과 원문에 따른 자동 판단을 수행합니다."]},
        "recognition": {"status": "success", "page_notes": [], "uncertain_spans": []},
        "key_sentences": sentences,
        "vocabulary": vocabulary, "visual_aids": visuals, "teacher_review": {"questions": ["선택한 학생의 모국어와 프로필을 확인했나요?", "원문과 교과 개념어가 보존되며 활동의 정답을 미리 드러내지 않나요?"]},
        "finalization": {}, "warnings": ["규칙 기반 데모이며 생성·분류·번역 품질 검증이 아닙니다."],
    })


def apply_teacher_edits(variant: dict, source: str, edits: ReconstructionEdits, confirmed: bool) -> dict:
    output = copy.deepcopy(variant["reconstruction"])
    if len(edits.sentences) != len(output["key_sentences"]) or {s.id for s in edits.sentences} != {s["id"] for s in output["key_sentences"]}:
        raise ValueError("기존 문장 ID를 모두 포함해 수정해 주세요.")
    if len(edits.vocabulary) != len(output["vocabulary"]) or {t.term for t in edits.vocabulary} != {t["term"] for t in output["vocabulary"]}:
        raise ValueError("기존 교과어를 모두 포함해 수정해 주세요.")
    if len(edits.visual_aids) != len(output["visual_aids"]):
        raise ValueError("기존 시각 자료를 모두 포함해 수정해 주세요.")
    by_id = {s.id: s for s in edits.sentences}
    by_term = {t.term: t for t in edits.vocabulary}
    contexts = {s["id"]: s for s in source_contexts(source)}
    for sentence in output["key_sentences"]:
        edit = by_id[sentence["id"]]
        if sentence.get("fixed") and edit.rewritten != sentence["source"]:
            raise ValueError("법 조문·인용·출처는 원문을 유지해 주세요.")
        if sentence["rewritten"] != edit.rewritten:
            sentence["swaps"] = []  # Stale model anchors must not survive a teacher rewrite.
        sentence["rewritten"] = edit.rewritten
        if edit.explanation is not None:
            sentence["explanation"] = edit.explanation
        if contexts[sentence["id"]].get("activity"):
            sentence["explanation"] = ""
    for term in output["vocabulary"]:
        term.update(by_term[term["term"]].model_dump())
        if term["translation"] and not output["learner_decision"]["native_language"]:
            raise ValueError("모국어가 없는 자료에는 번역을 저장할 수 없습니다. 프로필을 등록한 뒤 새 자료를 만들어 주세요.")
    for visual, edit in zip(output["visual_aids"], edits.visual_aids):
        visual.update(edit.model_dump())
    # Validate edited content while keeping source links, diagnosis and approval server-owned.
    ReconstructionOutput.model_validate({k: v for k, v in output.items() if k != "profile_context"})
    if civil_trial.matches(source):
        for sentence in output["key_sentences"]:
            if any(sentence["rewritten"].count(term) < sentence["source"].count(term) for term in civil_trial.PROTECTED):
                raise ValueError("민사 재판의 교과 개념어를 유지해 주세요.")
    _check_concept_preservation(output)
    _set_review_state(output, confirmed, True)
    student = {"levels": {"reading": variant["level"]}, "language": variant["language"]}
    return render_variant(output, source, student, variant["provider"])
