"""Bundled, unreviewed teaching example; never an automatic learner diagnosis.

The original attachment is retained as provenance. Seeded mistranslations and
its UI approval flags are intentionally never included in live agent requests.
"""
import copy
import json
from pathlib import Path

DATA = json.loads((Path(__file__).parent / "data/civil_trial_conversion.example.json").read_text(encoding="utf-8"))
PDF_URL = "/examples/civil-trial-source.pdf"
NOTICE = "첨부 민사 재판 자료의 시연용 예시입니다. 표현·설명·번역은 교사 검토 전이며, 예시 프로필은 실제 학생의 진단이 아닙니다. 원본 PDF와 텍스트를 비교해 주세요."


def clean(text):
    return text.replace("[[", "").replace("]]", "")


PAGE_ONE = {"conn", "s1", "s2", "bOld", "bFarm", "bSt1", "bSt2", "q1", "q1b", "q2", "q3"}
BLOCK_ORDER = [key for key in DATA["blocks"] if key in PAGE_ONE] + [key for key in DATA["blocks"] if key not in PAGE_ONE]
BLOCKS = [{"id": key, "source": ("민사소송법 제87조: " if key == "law" else "____ " if key == "q1b" else "") + clean(DATA["blocks"][key]["o"]),
           "page": 1 if key in PAGE_ONE else 2,
           "printed_page": 210 if key in PAGE_ONE else 211,
           "kind": "law" if key == "law" else "activity" if key.startswith("q") else "body"}
          for key in BLOCK_ORDER]
SOURCE = "\n".join(block["source"] for block in BLOCKS)
PROTECTED = list(DATA["terms"]) + ["소송", "당사자"]


def matches(source):
    return source.strip() == SOURCE


def example():
    profiles = []
    for key, value in DATA["learner_profiles"].items():
        profile = copy.deepcopy(value)
        profile["subject_profiles"] = profile.pop("subject", {})
        profile["diagnostic_notes"] = ["첨부 민사 재판 자료의 합성 시연 프로필입니다. 실제 학생의 진단 결과가 아닙니다."]
        profiles.append({"label": f"{DATA['groups'][key]['name']} · {DATA['groups'][key]['lv']} · {DATA['groups'][key]['ln']} (시연)", "profile": profile})
    return {"title": "민사 재판의 의미와 소송 대리인의 역할", "subject": "사회", "unit": DATA["material"]["unit"],
            "source_text": SOURCE, "source_pdf_url": PDF_URL, "notice": NOTICE,
            "blocks": BLOCKS, "profiles": profiles}


def sentence_contexts(splitter):
    result = []
    for block in BLOCKS:
        for sentence in splitter(block["source"]):
            result.append({"id": f"s{len(result) + 1}", "source": sentence["source"],
                           "page": block["page"], "block_id": block["id"],
                           "fixed": block["kind"] == "law", "activity": block["kind"] == "activity"})
    return result


def reading_band(profile):
    reading = profile["skills"].get("reading")
    if profile["level_scale"] != "diagnostic_1_6" or type(reading) is not int:
        return None
    return "l2" if reading <= 2 else "l4" if reading <= 4 else "l5"


def candidate_swaps(context, profile):
    band = reading_band(profile)
    if not band or context["fixed"]:
        return []
    result = []
    for original, replacement, bands in DATA["blocks"][context["block_id"]]["sw"]:
        # The attachment's tentative concept replacements conflict with its own
        # preservation rules; use only tool-word examples, never C/general terms.
        if band not in bands or DATA["swap_tiers"].get(original) not in ("2-1", "2-2"):
            continue
        if original not in context["source"] or any(term in original for term in PROTECTED):
            continue
        if len(replacement) > len(original) * 2 or context["source"].count(original) != 1:
            continue
        result.append({"original": original, "replacement": replacement})
    return result[:3 if band == "l2" else 2 if band == "l4" else 1]


def explanation(context, profile):
    block = DATA["blocks"][context["block_id"]]
    band = reading_band(profile) or "l4"
    return block.get("more", {}).get(band, "")


def terms(shared):
    result = []
    official = {entry["term"]: entry["translations"] for entry in shared["entries"]}
    for term, entry in DATA["terms"].items():
        translations = {language: value for language, value in entry.items() if language != "easy"}
        # Explicit image transcription takes precedence; all remain unreviewed.
        translations.update(official.get(term, {}))
        result.append({"term": term, "meaning": entry["easy"], "translations": translations})
    return result
