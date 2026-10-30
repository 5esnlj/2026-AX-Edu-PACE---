"""Server-owned L2 decisions; the model proposes evidence, never final verdicts."""
import re
import unicodedata
from pathlib import Path

from .models import AnalyzeInput, AnalysisOutput, Candidate
from ..glossary_data import REFERENCE_GLOSSARY as GLOSSARY

ROOT = Path(__file__).resolve().parent
SYSTEM_PROMPT = (ROOT / "prompt.md").read_text(encoding="utf-8")
LANGUAGES = {**GLOSSARY["languages"], "en": "영어", "uz": "우즈베크어", "bn": "벵골어"}
SIGNAL_FAMILIES = {"semantic_field": "usage", "collocation": "usage", "glossary_mismatch": "table",
                   "definition_conflict": "definition", "inconsistency": "consistency",
                   "confusion_pair": "confusion", "recognition": "recognition"}
SIGNAL_LABELS = {"semantic_field": "의미장 불일치", "collocation": "공기 불일치", "glossary_mismatch": "대역표 차이",
                 "definition_conflict": "정의문 충돌", "inconsistency": "문서 내 비일관성",
                 "confusion_pair": "용어 혼동 가능성", "recognition": "인식 오류 가능성"}


def normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def term_key(text: str) -> str:
    return normalized(text).replace(" ", "")


def segments(text: str) -> list[dict]:
    result, page = [], None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        marker = re.fullmatch(r"\[쪽 (\d{1,2})\]", line)
        if marker and 1 <= int(marker[1]) <= 50:
            page = int(marker[1])
            continue
        for start in range(0, len(line), 2000):
            index = len(result) + 1
            result.append({"id": f"p{index}", "text": line[start:start + 2000], "page": page,
                           "location": f"{page}쪽 · 문단 {index}" if page else f"문단 {index}"})
    if not result or len(result) > 500:
        raise ValueError("분석할 본문을 입력하고 문단을 500개 이하로 나누어 제출해 주세요.")
    return result


def prepare_request(data: AnalyzeInput) -> dict:
    references = [{"term": e["term"], "translation": e["translations"][data.language], "verification": GLOSSARY["verification"]}
                  for e in GLOSSARY["entries"] if data.language in e["translations"]]
    return {"mode": data.mode, "language": LANGUAGES[data.language], "subject": data.subject,
            "unit": data.unit, "segments": segments(data.document_text), "glossary": references,
            "glossary_notice": GLOSSARY["notice"], "glossary_version": GLOSSARY["version"],
            "confusion_dictionary": [], "cause_code_definitions": {},
            "recognition": "선택 가능한 텍스트 또는 교사가 확인한 추출 텍스트입니다. OCR을 수행하지 않았습니다."}


def reference_for(term: str, language: str):
    return next((e["translations"].get(language) for e in GLOSSARY["entries"] if term_key(e["term"]) == term_key(term)), None)


def explicit_pair(term: str, wrong: str, quote: str) -> bool:
    flexible_term = r"\s*".join(re.escape(part) for part in term.split())
    return re.search(flexible_term + r"\s*[:：=(（]\s*" + re.escape(wrong) + r"(?:\s*[)）;；]|\s*$)", quote) is not None


def demo_analysis(data: AnalyzeInput, request: dict) -> AnalysisOutput:
    weak = []
    if data.mode == "parallel":
        for segment in request["segments"]:
            for entry in request["glossary"]:
                pattern = r"\s*".join(re.escape(p) for p in entry["term"].split()) + r"\s*[:：=]\s*(.+)"
                match = re.fullmatch(pattern, segment["text"])
                if match and len(match[1]) <= 300 and normalized(match[1]) != normalized(entry["translation"]):
                    weak.append({"term": entry["term"], "wrong": match[1], "segment_id": segment["id"], "quote": segment["text"],
                        "signal": {"kind": "glossary_mismatch", "segment_id": segment["id"], "quote": segment["text"],
                                   "explanation": "입력한 병기 표현이 이미지 대역표와 다릅니다. 동의어·교과 맥락·대역표 자체의 정확성은 별도 확인이 필요합니다."}})
    return AnalysisOutput.model_validate({
        "summary": "규칙 기반 데모입니다. ‘한국어: 번역’ 형식의 병기를 참고 표와 비교했습니다. 문서 맥락·정의 충돌 분석은 Solar 설정이 필요합니다.",
        "subject": data.subject or "", "subject_confidence": 1 if data.subject else 0,
        "unit": data.unit or "", "unit_confidence": 1 if data.unit else 0,
        "selection_reason": "데모는 교과·단원을 추정하지 않습니다. 교사가 직접 선택해 주세요.",
        "items": [], "weak_candidates": weak[:30],
    })


def normalize_output(raw: AnalysisOutput, data: AnalyzeInput, request: dict, provider: str) -> dict:
    result = raw.model_dump()
    warnings = [GLOSSARY["notice"], "AI 검토 후보이며 오역 확정이 아닙니다. 대체 표현은 참고 대역으로 확인해 주세요."]
    if not request["glossary"]:
        warnings.append("선택 언어의 대역표가 없습니다. 맥락 검토만 가능하며 참고 대체어를 제시하지 않습니다.")
    if data.mode == "standalone":
        warnings.append("번역문 단독 분석은 한국어 원문을 대조할 수 없어 최대 ‘오역 의심’으로 표시합니다.")
    needs_selection = ((not data.subject and (raw.subject_confidence < .70 or raw.subject not in ("국어", "수학", "과학", "사회")))
                       or (not data.unit and (raw.unit_confidence < .60 or not raw.unit.strip())))
    result.update(subject=data.subject or raw.subject, unit=data.unit or raw.unit, needs_selection=needs_selection,
                  context_source={"subject": "teacher" if data.subject else "model", "unit": "teacher" if data.unit else "model"},
                  provider=provider, glossary_version=GLOSSARY["version"], warnings=warnings,
                  items=[], weak_candidates=[], counts={"confirmed": 0, "suspected": 0, "review": 0, "recognition": 0, "weak": 0})
    if needs_selection:
        result["selection_reason"] = raw.selection_reason or "교과·단원의 추정 근거가 부족합니다. 교사가 선택한 뒤 다시 분석해 주세요."
        return result  # Recount only visible candidates, including weak/recognition lists.
    result["selection_reason"] = ""
    source = {s["id"]: s for s in request["segments"]}
    grouped = {}
    discarded = False
    candidates = list(raw.items) + [Candidate(term=w.term, wrong=w.wrong, segment_id=w.segment_id, quote=w.quote,
        status="review", severity="S3", reason=w.signal.explanation, signals=[w.signal]) for w in raw.weak_candidates]
    for candidate in candidates:
        segment = source.get(candidate.segment_id)
        if not segment or candidate.quote not in segment["text"] or candidate.wrong not in candidate.quote:
            discarded = True
            continue
        if data.mode == "parallel" and term_key(candidate.term) not in term_key(data.document_text):
            discarded = True
            continue
        reference = reference_for(candidate.term, data.language)
        matched = bool(reference and normalized(candidate.wrong) == normalized(reference))
        grounded_signals = []
        for signal in candidate.signals:
            signal_source = source.get(signal.segment_id)
            if not signal_source or signal.quote not in signal_source["text"]:
                discarded = True
                continue
            if signal.kind == "glossary_mismatch" and (data.mode != "parallel" or not reference or matched or not explicit_pair(candidate.term, candidate.wrong, candidate.quote)):
                continue
            grounded_signals.append(signal.model_dump())
        if not grounded_signals:
            continue
        key = (term_key(candidate.term), normalized(candidate.wrong))
        if key not in grouped:
            grouped[key] = {"candidate": candidate, "signals": [], "reference": reference, "matched": matched}
        grouped[key]["signals"].extend(grounded_signals)
    for group in grouped.values():
        candidate = group["candidate"]
        independent, families, evidence = [], set(), set()
        # Repetitions, paraphrases with the same source quote, and usage subtypes are one evidence unit.
        for signal in group["signals"]:
            family, quote = SIGNAL_FAMILIES[signal["kind"]], normalized(signal["quote"])
            if family in families or quote in evidence:
                continue
            families.add(family)
            evidence.add(quote)
            independent.append(dict(signal, label=SIGNAL_LABELS[signal["kind"]]))
        recognition = any(s["kind"] == "recognition" for s in group["signals"])
        status = "recognition" if recognition else "suspected" if len(independent) >= 2 else "review"
        locations = [{"segment_id": s["id"], "page": s["page"], "location": s["location"], "quote": s["text"],
                      "occurrences": s["text"].count(candidate.wrong)} for s in source.values() if candidate.wrong in s["text"]]
        item = {"term": candidate.term, "wrong": candidate.wrong, "quote": candidate.quote,
                "status": status, "severity": "S3" if recognition else candidate.severity,
                "reason": candidate.reason, "cause": candidate.cause, "cause_is_hypothesis": True,
                "cause_code": None,  # No authoritative E/R code definitions were supplied.
                "signals": independent, "independent_signal_count": len(independent),
                "reference_translation": group["reference"], "glossary_match": group["matched"],
                "correct": group["reference"] if group["reference"] and not group["matched"] and not recognition and data.mode == "parallel" else "",
                "reference_verification": GLOSSARY["verification"], "locations": locations,
                "occurrences": sum(loc["occurrences"] for loc in locations),
                "decision_note": "검수되지 않은 참고 표와 모델 신호만으로는 확정하지 않습니다. 원문 인용은 확인했지만 의미 판단은 교사 검토가 필요합니다."}
        if status == "review":
            result["weak_candidates"].append(item)
            result["counts"]["weak"] += 1
        else:
            result["items"].append(item)
            result["counts"][status] += 1
    if discarded:
        warnings.append("원문에서 확인할 수 없는 인용문·위치·근거는 결과에서 제외했습니다.")
    if not result["items"] and not result["weak_candidates"]:
        warnings.append("제시할 근거가 있는 후보를 찾지 못했습니다. 오역이 없다고 검증한 결과는 아닙니다.")
    return result
