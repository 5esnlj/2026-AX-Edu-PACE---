"""LearningAgent interface, offline demo implementation and assessment rules."""
import re
from typing import Protocol

LANGUAGES = {"vi": "베트남어", "en": "영어", "uz": "우즈베크어", "mn": "몽골어", "bn": "벵골어"}
SUBJECTS = ["사회", "과학", "수학", "국어"]
SAMPLE_TEXT = """민주주의는 국민이 나라의 주인으로서 국가의 중요한 일을 결정하는 정치 제도입니다.
국민은 선거에서 투표하여 자신을 대표할 사람을 뽑습니다.
시민은 지역의 문제를 토론하고, 서로 다른 의견을 존중하며, 문제 해결에 참여합니다.
권리는 사람이 누릴 수 있는 정당한 자격이며, 의무는 공동체에서 마땅히 해야 하는 일입니다.
시민 참여는 투표뿐만 아니라 지역 문제에 의견을 내는 활동도 포함합니다."""

# Illustrative glossary, NOT an authoritative or professionally validated term base.
GLOSSARY = [
    {"term": "민주주의", "meaning": "사람들이 함께 나라의 일을 결정하는 제도", "translations": {"en": "democracy", "vi": "dân chủ", "uz": "demokratiya", "mn": "ардчилал", "bn": "গণতন্ত্র"}},
    {"term": "국민", "meaning": "한 나라에 속한 사람들", "translations": {"en": "citizen", "vi": "công dân", "uz": "fuqaro", "mn": "иргэн", "bn": "নাগরিক"}},
    {"term": "선거", "meaning": "대표할 사람을 뽑는 일", "translations": {"en": "election", "vi": "bầu cử", "uz": "saylov", "mn": "сонгууль", "bn": "নির্বাচন"}},
    {"term": "투표", "meaning": "내가 고른 사람이나 의견을 표시하는 일", "translations": {"en": "voting", "vi": "bỏ phiếu", "uz": "ovoz berish", "mn": "санал өгөх", "bn": "ভোটদান"}},
    {"term": "권리", "meaning": "내가 정당하게 누릴 수 있는 것", "translations": {"en": "right", "vi": "quyền", "uz": "huquq", "mn": "эрх", "bn": "অধিকার"}},
    {"term": "의무", "meaning": "함께 살기 위해 해야 하는 일", "translations": {"en": "duty", "vi": "nghĩa vụ", "uz": "burch", "mn": "үүрэг", "bn": "কর্তব্য"}},
    {"term": "시민 참여", "meaning": "우리 사회의 일을 함께 고민하고 돕는 활동", "translations": {"en": "civic participation", "vi": "sự tham gia của công dân", "uz": "fuqarolik ishtiroki", "mn": "иргэдийн оролцоо", "bn": "নাগরিক অংশগ্রহণ"}},
]

class LearningAgent(Protocol):
    def reconstruct(self, source: str, level: int, language: str, modes: list[str]) -> dict: ...
    def questions(self, source: str) -> list[dict]: ...

class DemoLearningAgent:
    provider = "demo"

    def reconstruct(self, source: str, level: int, language: str, modes: list[str]) -> dict:
        terms = [dict(t, translation=t["translations"][language], verified=False) for t in GLOSSARY if t["term"] in source]
        text = source.strip()
        if "easy" in modes:
            replacements = {"국가의": "나라의", "정치 제도입니다": "정치 방식이에요", "결정하는": "정하는", "마땅히": "꼭", "뿐만 아니라": "말고도", "포함합니다": "들어가요", "존중하며": "소중하게 생각하며"}
            # Safe, reviewed sample for the included lesson; other sources use limited substitutions.
            if source.strip() == SAMPLE_TEXT.strip() and level <= 2:
                text = "나라의 주인은 국민이에요. 국민이 나라의 중요한 일을 함께 정해요. 이것을 민주주의라고 해요.\n국민은 선거에서 대표를 뽑아요. 내가 고른 사람을 표시하는 일이 투표예요.\n우리는 지역의 문제를 함께 이야기해요. 다른 사람의 의견도 소중하게 생각해요.\n권리는 내가 누릴 수 있는 것이에요. 의무는 함께 살기 위해 해야 하는 일이에요.\n투표를 하거나 지역 문제에 의견을 내는 일은 시민 참여예요."
            elif level <= 2:
                for before, after in replacements.items():
                    text = text.replace(before, after)
        return {"text": text, "terms": terms if "bilingual" in modes else [], "visuals": [{"term": t["term"], "meaning": t["meaning"]} for t in terms[:4]] if "visual" in modes else [], "level": level, "language": language, "provider": "demo", "notice": "규칙 기반 데모 결과입니다. 의미 보존·번역·수준 적합성을 교사가 확인해 주세요."}

    def questions(self, source: str) -> list[dict]:
        if re.sub(r"\s+", "", source) != re.sub(r"\s+", "", SAMPLE_TEXT):
            raise ValueError("데모 문항은 ‘민주주의와 시민 참여’ 예제만 지원합니다. 다른 단원의 문항 생성은 실제 AI 어댑터 연결이 필요합니다.")
        return [
            {"id": "q1", "concept": "민주주의", "load": "standard", "prompt": "민주주의에서 국가의 중요한 일을 결정하는 주체는 누구인가요?", "options": ["국민", "왕 한 사람", "외국의 대표"], "answer": 0, "explanation": "민주주의에서는 국민이 나라의 주인으로서 중요한 일을 결정해요."},
            {"id": "q2", "concept": "민주주의", "load": "reduced", "prompt": "학급의 대표를 뽑아요. 모두의 의견을 모으는 방법은 무엇인가요?", "options": ["한 사람이 마음대로 정해요", "모두 한 표씩 투표해요", "가장 키가 큰 사람이 정해요"], "answer": 1, "explanation": "한 사람씩 투표하면 모두의 의견을 모을 수 있어요. 교실 상황으로 같은 개념을 확인했어요."},
            {"id": "q3", "concept": "시민 참여", "load": "standard", "prompt": "시민이 지역의 문제 해결에 참여하는 사례로 알맞은 것은 무엇인가요?", "options": ["지역 문제는 항상 다른 사람이 해결해요", "다른 사람의 의견은 듣지 않아요", "동네의 불편한 점을 이야기하고 해결 방법을 제안해요"], "answer": 2, "explanation": "지역의 문제에 의견을 내고 함께 해결하려는 활동도 시민 참여예요."},
            {"id": "q4", "concept": "시민 참여", "load": "reduced", "prompt": "놀이터에 쓰레기가 많아요. 함께 해결하는 행동을 골라요.", "options": ["친구와 청소할 방법을 의논해요", "보지 못한 척해요", "친구의 의견을 무시해요"], "answer": 0, "explanation": "우리 주변의 문제를 함께 이야기하고 해결하는 것도 참여예요."},
        ]

def public_questions(questions: list[dict]) -> list[dict]:
    # Answer keys and explanations are never sent before submission.
    return [{k: v for k, v in q.items() if k not in {"answer", "explanation"}} for q in questions]

def assess(questions: list[dict], answers: dict[str, int]) -> dict:
    results = [dict(id=q["id"], correct=answers[q["id"]] == q["answer"], selected=answers[q["id"]], answer=q["answer"], explanation=q["explanation"], load=q["load"], concept=q["concept"]) for q in questions]
    standard = sum(r["correct"] for r in results if r["load"] == "standard")
    reduced = sum(r["correct"] for r in results if r["load"] == "reduced")
    if reduced == 2 and standard < reduced:
        kind, label = "language", "한국어 지원을 먼저 살펴봐요"
        recommendation = "쉬운 문장과 교과어 풀이를 먼저 제공하고, 같은 개념을 다시 확인해 주세요."
    elif reduced == 0 and standard == 0:
        kind, label = "concept", "개념 설명과 언어 지원을 함께 살펴봐요"
        recommendation = "실물·그림·익숙한 상황으로 개념을 다시 설명해 주세요. 언어 요인을 배제할 수는 없어요."
    elif standard == 2 and reduced == 2:
        kind, label = "steady", "이번 문항에서는 잘 이해했어요"
        recommendation = "새로운 상황에서 개념을 설명하는 활동으로 학습을 이어가 주세요."
    else:
        kind, label = "observe", "추가 관찰이 필요해요"
        recommendation = "응답이 혼재되어 있어요. 학생과 짧게 대화하고 다른 문항으로 확인해 주세요."
    return {"results": results, "score": sum(r["correct"] for r in results), "total": len(results), "standard": standard, "reduced": reduced, "kind": kind, "label": label, "recommendation": recommendation, "caution": "4개 문항의 학습 지원 참고 신호입니다. 표준화된 진단이나 인지 능력 판정이 아니며, 문항 난이도 차이도 결과에 영향을 줄 수 있습니다."}

ROADMAP = [
    {"id": "words", "title": "교과어와 친해지기", "description": "수업에서 만난 낱말을 쉬운 뜻과 연결해요.", "minutes": 5, "prompt": "‘선거’의 뜻은 무엇인가요?", "options": ["대표할 사람을 뽑는 일", "친구와 운동하는 일", "그림을 그리는 일"], "answer": 0},
    {"id": "sentences", "title": "짧은 문장으로 이해하기", "description": "핵심 문장을 읽고 뜻을 확인해요.", "minutes": 7, "prompt": "‘다른 사람의 의견을 존중해요’와 같은 뜻을 골라요.", "options": ["다른 의견을 무시해요", "다른 생각도 소중하게 여겨요", "나만 이야기해요"], "answer": 1},
    {"id": "concepts", "title": "우리 생활과 연결하기", "description": "배운 개념을 익숙한 상황에 적용해요.", "minutes": 8, "prompt": "시민 참여의 예를 골라요.", "options": ["동네 문제에 관심을 갖지 않아요", "혼자서만 결정해요", "동네 회의에서 의견을 말해요"], "answer": 2},
    {"id": "explain", "title": "배운 내용을 다시 확인하기", "description": "민주주의의 핵심을 확인하며 마무리해요.", "minutes": 5, "prompt": "민주주의에서 나라의 주인은 누구인가요?", "options": ["국민", "왕", "군인"], "answer": 0},
]
