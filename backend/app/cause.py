"""학습 결손 원인 구분: 한국어 어려움 vs 교과 개념 어려움.

기준 문서: 「학습 결손 원인 구분 기준」(2026-10-31 확정)
- 틀린 문항의 교과에서 학생의 학습 한국어 수준(6수준 진단)이
  LANGUAGE_MAX_LEVEL 이하이면 '한국어 어려움', 초과이면 '교과 개념 어려움'.
- 진단 전이거나 그 교과 진단이 '다시 확인 필요'이면 판정 보류.
"""

LANGUAGE_MAX_LEVEL = 3  # 기준선(설정값): 3 이하 = 한국어 어려움, 4 이상 = 교과 개념 어려움
SURFACE_GAP = 0.5  # 생활·학습 한국어 격차가 이 이상이면 표면적 유창성 주의

LEVEL_NAMES = ["시작", "초기", "발달", "확장", "연결", "도달"]

LABELS = {
    "language": "한국어 어려움",
    "concept": "교과 개념 어려움",
    "pending": "판정 보류",
    "steady": "이해했어요",
}
ACTIONS = {
    "language": "괄호 풀이와 모국어 병기, 핵심 낱말 미리 알려 주기, 문장틀 주기. 지원한 뒤에도 틀리면 개념도 함께 살펴 주세요.",
    "concept": "개념을 예시·그림으로 다시 설명하고, 흔한 오개념을 짚어 준 뒤 짧은 질문으로 확인해 주세요.",
    "pending": "한국어 자가 점검(교과 진단)을 먼저 안내해 주세요.",
    "steady": "지금처럼 지원하거나 한 단계 위 표현으로 도전하게 해 주세요.",
}


def classify_causes(results: list[dict], subject: str | None, summary: dict | None) -> dict:
    """개념별 판정. results = 이해 확인 채점 결과(개념·정답 여부)."""
    wrong = list(dict.fromkeys(r["concept"] for r in results if not r["correct"]))
    right = [c for c in dict.fromkeys(r["concept"] for r in results) if c not in wrong]
    subj = ((summary or {}).get("subjects") or {}).get(subject or "") or {}
    level = subj.get("level")
    gap = (summary or {}).get("gap")

    if not summary:
        kind, reason = "pending", "아직 한국어 자가 점검(진단) 결과가 없어 원인을 가르기 어려워요."
    elif subj.get("recheck") or not level:
        kind, reason = "pending", f"{subject} 진단 결과가 불확실해서 원인을 가르기 어려워요."
    elif level <= LANGUAGE_MAX_LEVEL:
        kind, reason = "language", f"{subject} 학습 한국어가 {level}수준({LEVEL_NAMES[level - 1]})으로 아직 자라는 중이라 한국어 때문일 가능성이 커요."
    else:
        kind, reason = "concept", f"{subject} 학습 한국어가 {level}수준({LEVEL_NAMES[level - 1]})으로 충분해서 개념 이해를 살펴볼 차례예요."

    notes = []
    if kind == "concept" and gap is not None and gap >= SURFACE_GAP:
        notes.append("대화는 유창하지만 공부에 쓰는 한국어와 격차가 커요(표면적 유창성). 한 번 더 확인해 주세요.")

    items = [{"concept": c, "kind": kind, "label": LABELS[kind]} for c in wrong]
    overall = kind if wrong else "steady"
    return {
        "subject": subject,
        "subject_level": level,
        "threshold": LANGUAGE_MAX_LEVEL,
        "kind": overall,
        "label": LABELS[overall],
        "reason": reason if wrong else "이번 문항의 개념을 모두 맞혔어요.",
        "action": ACTIONS[overall],
        "notes": notes if wrong else [],
        "wrong": items,
        "understood": right,
    }
