import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.cause import classify_causes

RESULTS = [
    {"concept": "민주주의", "correct": False},
    {"concept": "민주주의", "correct": True},
    {"concept": "시민 참여", "correct": True},
]


def summary(level, recheck=False, gap=0.1):
    return {"subjects": {"사회": {"level": level, "recheck": recheck, "flags": []}}, "gap": gap}


class CauseTest(unittest.TestCase):
    def test_low_level_is_language(self):
        r = classify_causes(RESULTS, "사회", summary(3))
        self.assertEqual(r["kind"], "language")
        self.assertEqual([w["concept"] for w in r["wrong"]], ["민주주의"])
        self.assertEqual(r["understood"], ["시민 참여"])

    def test_high_level_is_concept(self):
        r = classify_causes(RESULTS, "사회", summary(4))
        self.assertEqual(r["kind"], "concept")
        self.assertEqual(r["notes"], [])

    def test_surface_fluency_note(self):
        r = classify_causes(RESULTS, "사회", summary(5, gap=0.6))
        self.assertEqual(r["kind"], "concept")
        self.assertTrue(r["notes"])

    def test_pending_without_diagnosis_or_recheck(self):
        self.assertEqual(classify_causes(RESULTS, "사회", None)["kind"], "pending")
        self.assertEqual(classify_causes(RESULTS, "사회", summary(4, recheck=True))["kind"], "pending")
        self.assertEqual(classify_causes(RESULTS, "과학", summary(4))["kind"], "pending")

    def test_all_correct_is_steady(self):
        r = classify_causes([{"concept": "민주주의", "correct": True}], "사회", summary(2))
        self.assertEqual(r["kind"], "steady")
        self.assertEqual(r["wrong"], [])


if __name__ == "__main__":
    unittest.main()
