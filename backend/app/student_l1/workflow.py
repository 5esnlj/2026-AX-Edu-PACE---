"""Adapt the uploaded student workflow to stored six-level diagnoses and Solar.

The CLI's single hard-coded persona is replaced by the authenticated student's
profile. The host owns completion, opt-in, identity, persistence and answers.
"""
import json
import re
import unicodedata
from pathlib import Path

from .models import MaterialOutput, AssessmentOutput, FairnessReview
from ..l1.workflow import split_sentences
from ..glossary_data import REFERENCE_GLOSSARY

ROOT = Path(__file__).parent
RULES = json.loads((ROOT / "reconstruction_rules.json").read_text(encoding="utf-8"))
FAIRNESS = json.loads((ROOT / "evaluation_fairness_rules.json").read_text(encoding="utf-8"))
# Retain the supplied pedagogical policy; use the application's validated JSON
# contract instead of the CLI's incompatible output shape.
MATERIAL_PROMPT = (ROOT / "agent_system_prompt.md").read_text(encoding="utf-8").split("## 출력 형식")[0].replace("Gemini", "모델")
ASSESSMENT_PROMPT = (ROOT / "assessment_prompt.md").read_text(encoding="utf-8").split("## 출력 형식")[0]


def request_for(profile, source, subject, title):
    return {
        "learner_profile": profile,
        "subject": subject,
        "source_name": title,
        "source_text": source,
        "source_sentences": split_sentences(source),
        "reconstruction_rules": RULES,
        "protected_terms": [entry["term"] for entry in REFERENCE_GLOSSARY["entries"] if entry["term"] in source],
        "host_capabilities": {"text_pdf": True, "ocr": False, "visual_aids": True},
    }


def demo_material(request):
    # A reproducible preview, not a fabricated model reconstruction.
    return {
        "sentences": [dict(s, rewritten=s["source"]) for s in request["source_sentences"]],
        "vocabulary": [], "visual_aids": [],
    }


def normalize_material(output, request, provider):
    result = MaterialOutput.model_validate(output).model_dump()
    sources = {s["id"]: s["source"] for s in request["source_sentences"]}
    ids = [s["id"] for s in result["sentences"]]
    if len(ids) != len(set(ids)):
        raise ValueError("원문 문장 ID가 중복되었습니다.")
    for sentence in result["sentences"]:
        if sources.get(sentence["id"]) != sentence["source"]:
            raise ValueError("재구성 문장의 원문 근거가 일치하지 않습니다.")
        for term in request["protected_terms"]:
            if term in sentence["source"] and term not in sentence["rewritten"]:
                raise ValueError("등록된 핵심 교과어가 유지되지 않았습니다.")
    for term in result["vocabulary"]:
        if term["term"] not in request["source_text"]:
            raise ValueError("원문에 없는 핵심어입니다.")
        if not request["learner_profile"].get("native_language"):
            term["translation"] = ""
        if term["action"] == "simplify":
            # The supplied lexicon has no verified vocabulary level comparisons.
            # Do not accept the model's guess as permission to replace a term.
            raise ValueError("어휘 단계 비교 근거가 없어 핵심어를 대체할 수 없습니다. 상세화로 지원해 주세요.")
        if term["tier"] in ("2-3", "3"):
            if term["action"] == "simplify":
                raise ValueError("핵심 교과 개념어는 삭제하거나 대체하지 않습니다.")
            for sentence in result["sentences"]:
                if term["term"] in sentence["source"] and term["term"] not in sentence["rewritten"]:
                    raise ValueError("핵심 교과 개념어가 유지되지 않았습니다.")
    for visual in result["visual_aids"]:
        if not set(visual["source_sentence_ids"]) <= set(ids):
            raise ValueError("시각 자료의 문장 근거를 확인하지 못했습니다.")
    if not request["learner_profile"].get("overall_korean_level"):
        # Unknown is not the lowest level. Preserve every original sentence.
        result = MaterialOutput.model_validate(demo_material(request)).model_dump()
        notice = "아직 6수준 진단 결과가 없어 원문을 그대로 보관했습니다. 한국어 자가 점검 후 맞춤 자료를 만들어 보세요."
    elif provider == "demo":
        notice = "규칙 기반 체험 자료입니다. 원문을 보관하며, 실제 AI 수준별 재구성·번역은 Solar 연결 후 제공됩니다."
    else:
        notice = "6수준 진단을 반영한 AI 학습 자료입니다. 원문과 함께 확인하고, 낯선 내용은 선생님에게 물어보세요."
    if not request["learner_profile"].get("native_language"):
        notice += " 모국어가 등록되지 않아 번역을 제공하지 않습니다."
    return dict(result, provider=provider, notice=notice)


def demo_assessment(material):
    review = {key: True for key in FairnessReview.model_fields}
    return {"items": [
        {"id": f"q{i}", "type": "true_false", "learning_objective": "자료의 핵심 문장 확인",
         "prompt": f"자료에서 다음과 같이 설명했나요?\n{sentence['rewritten']}",
         "choices": ["O", "X"], "correct_answer": "O", "accepted_answers": [],
         "explanation": sentence["rewritten"], "source_sentence_ids": [sentence["id"]], "review": review}
        for i, sentence in enumerate(material["sentences"][:3], 1)
    ]}


def normalize_assessment(output, material):
    quiz = AssessmentOutput.model_validate(output).model_dump()
    ids = [q["id"] for q in quiz["items"]]
    source_ids = {s["id"] for s in material["sentences"]}
    if len(ids) != len(set(ids)):
        raise ValueError("문항 ID가 중복되었습니다.")
    for question in quiz["items"]:
        if not set(question["source_sentence_ids"]) <= source_ids:
            raise ValueError("학습 자료에 없는 문장 근거입니다.")
    return quiz


def public_quiz(quiz):
    if not quiz:
        return None
    # A strict allowlist; model-provided explanations and answers stay server-side.
    return {"items": [{k: q[k] for k in ("id", "type", "prompt", "choices")} for q in quiz["items"]],
            "answer_visibility": "after_submission"}


def score(quiz, answers):
    if set(answers) != {q["id"] for q in quiz["items"]}:
        raise ValueError("모든 문항에 응답해 주세요.")
    def normalized(text):
        return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip().casefold()
    results = []
    for q in quiz["items"]:
        selected = answers[q["id"]]
        if q["type"] != "short_answer" and selected not in q["choices"]:
            raise ValueError("문항의 선택지 중 하나를 선택해 주세요.")
        accepted = [q["correct_answer"], *q["accepted_answers"]] if q["type"] == "short_answer" else [q["correct_answer"]]
        results.append({"id": q["id"], "correct": normalized(selected) in {normalized(a) for a in accepted},
                        "selected": selected, "correct_answer": q["correct_answer"], "explanation": q["explanation"]})
    return {"score": sum(r["correct"] for r in results), "total": len(results), "results": results,
            "notice": "학습 내용 확인용 결과이며 한국어 진단 수준을 변경하지 않습니다. 주관식은 등록된 허용 답안과 비교하므로, 의미가 같은 다른 답은 선생님과 확인해 주세요."}
