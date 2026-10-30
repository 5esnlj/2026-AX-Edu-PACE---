import json
from pathlib import Path

BANK = json.loads((Path(__file__).parent / "bank.json").read_text(encoding="utf-8"))
ITEMS = {q["id"]: q for q in BANK["items"]}
DOMAINS = ["listening", "reading", "writing", "speaking"]
LABELS = dict(zip(DOMAINS, ["듣기", "읽기", "쓰기", "말하기"]))
LEVELS = BANK["levels"]
TIERS = {
    "B": "생활 한국어",
    "T1": "교실 어휘",
    "T2": "사고도구 어휘",
    "T3": "범용 지식 어휘",
    "C": "교과 적응 한국어",
}
SUBJECT_MAP = {
    "국어": ("듣-07", "읽-09", "듣-11", ["쓰-4", "말-6"]),
    "수학": ("듣-08", "읽-10", "듣-12", ["말-5"]),
    "과학": ("읽-07", "듣-09", "읽-11", ["말-4", "쓰-5"]),
    "사회": ("읽-08", "듣-10", "읽-12", ["쓰-6"]),
}
RUBRIC = {
    "R1": ["충족 없음·무관한 응답", "필수 요소 1개 충족", "2개 충족", "3개 모두 충족"],
    "R2": ["표적어 사용 없음", "문맥에 맞게 1개 사용", "2개 사용", "3개 사용"],
    "R3": [
        "낱말·구 수준",
        "분량 미달 또는 단문 나열",
        "분량 충족, 구조 일부 미흡",
        "요구 분량과 구조 모두 충족",
    ],
    "R4": [
        "의미 파악 어려움",
        "일부 의미 해석 어려움",
        "오류가 있어도 의미 이해 가능",
        "조사·어미 오류가 드묾",
    ],
}


def task_verdict(scores, level):
    total = sum(scores)
    if scores[0] < 2:
        return "F"
    advanced = level < 5 or (scores[2] >= 2 and scores[3] >= 2)
    if total >= 8 and advanced:
        return "P"
    if total == 7 or (total >= 8 and not advanced):
        return "B"
    return "F"


def domain_level(raw):
    adjusted = list(raw)
    correction = None
    for i in range(5):
        if raw[i] == "B" and raw[i + 1] == "P":
            adjusted[i] = "P"
            correction = i + 1
            break
    k = 0
    for value in adjusted:
        if value != "P":
            break
        k += 1
    plus = k > 0 and k < 6 and adjusted[k] == "B"
    flags = ["비연속 통과"] if any(v == "P" for v in adjusted[k + 1 :]) else []
    return {
        "level": k,
        "label": LEVELS[k - 1] if k else "선생님과 다시 확인해요",
        "next_challenge": plus,
        "display": str(k) + ("+" if plus else "") if k else "측정 보류",
        "raw": raw,
        "adjusted": adjusted,
        "correction_level": correction,
        "flags": flags,
    }


def evaluate(state):
    responses, grades = state["responses"], state["grades"]
    finished = state["finished"]
    points, verdicts = {}, {}
    for q in BANK["items"]:
        if q["domain"] in ("listening", "reading"):
            if q["domain"] in finished:
                points[q["id"]] = int(responses.get(q["id"]) == q["answer"])
        elif q["id"] in grades:
            verdict = task_verdict(grades[q["id"]]["scores"], q["level"])
            verdicts[q["id"]] = verdict
            points[q["id"]] = {"P": 1, "B": 0.5, "F": 0}[verdict]
        elif q["domain"] in finished:
            verdicts[q["id"]] = "미실시"
            points[q["id"]] = 0
    domains = {}
    for domain in DOMAINS:
        if domain not in finished:
            started = (
                any(
                    q["domain"] == domain and q["id"] in responses
                    for q in BANK["items"]
                )
                or state.get("stage") == domain
            )
            domains[domain] = {
                "level": None,
                "label": "진행 중" if started else "진단 전",
                "next_challenge": False,
                "display": "확인 대기",
            }
            continue
        prefix = {
            "listening": "듣",
            "reading": "읽",
            "writing": "쓰",
            "speaking": "말",
        }[domain]
        if domain in ("listening", "reading"):
            scores = [
                sum(points[f"{prefix}-{i:02d}"] for i in (2 * n - 1, 2 * n))
                for n in range(1, 7)
            ]
            raw = [{2: "P", 1: "B", 0: "F"}[n] for n in scores]
        else:
            raw = [verdicts.get(f"{prefix}-{n}", "미실시") for n in range(1, 7)]
        domains[domain] = domain_level(raw)
    complete = all(d in finished for d in DOMAINS)
    levels = [domains[d]["level"] for d in DOMAINS]
    overall = None
    if complete:
        ordered = sorted(levels)
        overall = (
            0 if 0 in levels else min((ordered[1] + ordered[2]) // 2, ordered[0] + 2)
        )
    layers = {}
    for tier, label in TIERS.items():
        qs = [q for q in BANK["items"] if q["tier"] == tier]
        available = sum(q["id"] in points for q in qs)
        score = sum(points.get(q["id"], 0) for q in qs)
        ratio = score / len(qs) if complete else None
        layers[tier] = {
            "label": label,
            "score": score,
            "total": len(qs),
            "ratio": round(ratio, 4) if ratio is not None else None,
            "state": (
                "확인 대기"
                if ratio is None
                else "안정" if ratio >= 0.8 else "형성 중" if ratio >= 0.5 else "미형성"
            ),
            "unadministered": sum(verdicts.get(q["id"]) == "미실시" for q in qs),
            "scored_items": available,
        }
    bottleneck = next(
        (
            tier
            for tier, v in layers.items()
            if v["ratio"] is not None and v["ratio"] < 0.8
        ),
        None,
    )
    subjects = {}
    for name, (t3, c5, c6, output) in SUBJECT_MAP.items():
        available = all(q in points for q in (t3, c5, c6))
        s = (
            None
            if not available
            else (
                3
                if not points[t3]
                else 4 if not points[c5] else 5 if not points[c6] else 6
            )
        )
        flags = []
        if available and (
            not points[t3]
            and (points[c5] or points[c6])
            or not points[c5]
            and points[c6]
        ):
            flags.append("추측 의심")
        if s is not None and overall and abs(s - overall) >= 2:
            flags.append("교과 편차")
        if s is not None and any(
            ITEMS[q]["level"] <= s and verdicts.get(q) in ("B", "F") for q in output
        ):
            flags.append("이해>표현")
        subjects[name] = {
            "level": s,
            "display": "확인 대기" if s is None else "≤3" if s == 3 else str(s),
            "t3": points.get(t3),
            "c5": points.get(c5),
            "c6": points.get(c6),
            "items": [t3, c5, c6],
            "output": {q: verdicts.get(q, "채점 대기") for q in output},
            "flags": flags,
            "recheck": s == 3 or "추측 의심" in flags,
        }
    gap = (
        None if not complete else round(layers["B"]["ratio"] - layers["C"]["ratio"], 2)
    )
    inversion = [
        f"{a}→{b}"
        for i, a in enumerate(TIERS)
        for b in list(TIERS)[i + 1 :]
        if complete and round(layers[b]["ratio"] - layers[a]["ratio"], 4) >= 0.3
    ]
    subject_levels = sorted(
        s["level"] for s in subjects.values() if s["level"] is not None
    )
    prescriptions = []
    if any(d["level"] == 0 for d in domains.values()):
        prescriptions.append(
            "수준을 확정하기 어려운 영역은 모국어 평가·관찰과 재확인을 먼저 합니다."
        )
    known = [v for v in levels if v]
    if known:
        prescriptions.append(
            [
                "그림·실물·낱말 카드와 모국어로 핵심 낱말부터 익힙니다.",
                "문장틀과 예시로 짧게 말하고 쓰게 합니다.",
                "그래픽 조직자·어휘 목록·연결어 카드를 제공합니다.",
                "상위어·하위어 묶기와 비교 글쓰기를 연습합니다.",
                "최소 지원으로 원인-결과와 주장-근거를 설명합니다.",
                "또래 과제와 의견문·토론으로 확장합니다.",
            ][min(known) - 1]
        )
    if bottleneck:
        prescriptions.append(f"{TIERS[bottleneck]}를 우선 지원합니다.")
    if any(s["recheck"] for s in subjects.values()):
        prescriptions.append(
            "재확인 표시가 있는 교과는 학습 경험을 확인하고 다시 관찰합니다."
        )
    return {
        "version": BANK["version"],
        "complete": complete,
        "domains": domains,
        "overall": overall,
        "layers": layers,
        "bottleneck": bottleneck,
        "gap": gap,
        "gap_label": (
            None
            if gap is None
            else "큰 격차" if gap >= 0.5 else "중간 격차" if gap >= 0.3 else "작은 격차"
        ),
        "subjects": subjects,
        "subject_representative": (
            (subject_levels[1] + subject_levels[2]) // 2
            if len(subject_levels) == 4
            else None
        ),
        "layer_inversions": inversion,
        "prescriptions": prescriptions[:3],
    }


def student_result(result):
    return {
        "complete": result["complete"],
        "overall": result["overall"],
        "overall_label": (
            LEVELS[result["overall"] - 1]
            if result["overall"]
            else "선생님과 다시 확인해요" if result["overall"] == 0 else "진단 진행 중"
        ),
        "domains": {
            d: {k: v[k] for k in ("level", "label", "next_challenge")}
            for d, v in result["domains"].items()
        },
        "layers": {
            k: {
                "label": v["label"],
                "state": {
                    "안정": "잘해요",
                    "형성 중": "거의 다 왔어요",
                    "미형성": "같이 연습해요",
                }.get(v["state"], "확인 중"),
            }
            for k, v in result["layers"].items()
            if k != "C"
        },
        "subjects": {
            k: {
                "label": (
                    "선생님과 한 번 더 확인해요"
                    if v["recheck"]
                    else LEVELS[v["level"] - 1] if v["level"] else "확인 중"
                ),
                "recheck": v["recheck"],
            }
            for k, v in result["subjects"].items()
        },
    }
