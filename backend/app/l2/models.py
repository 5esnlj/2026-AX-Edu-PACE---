from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Language = Literal["vi", "zh", "ru", "ja", "mn", "en", "uz", "bn"]
Subject = Literal["국어", "수학", "과학", "사회"]
SignalKind = Literal["semantic_field", "collocation", "glossary_mismatch", "definition_conflict", "inconsistency", "confusion_pair", "recognition"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AnalyzeInput(Model):
    title: Short = "수업 자료 오역 검토"
    document_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=30, max_length=40000)]
    mode: Literal["parallel", "standalone"] = "parallel"
    language: Language
    subject: Subject | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None
    material_id: str | None = Field(default=None, max_length=100)


class Evidence(Model):
    kind: SignalKind
    segment_id: Short
    quote: Text
    explanation: Text


class Candidate(Model):
    term: Short
    wrong: Short
    correct: str = Field(default="", max_length=300)
    status: Literal["confirmed", "suspected", "review", "recognition"]
    severity: Literal["S1", "S2", "S3"]
    segment_id: Short
    quote: Text
    reason: Text
    cause_code: Annotated[str, StringConstraints(pattern=r"^(E[1-7]|R(?:[1-9]|10))$")] | None = None
    cause: str = Field(default="", max_length=2000)
    signals: list[Evidence] = Field(max_length=8)


class WeakCandidate(Model):
    term: Short
    wrong: Short
    segment_id: Short
    quote: Text
    signal: Evidence


class AnalysisOutput(Model):
    summary: Text
    subject: str = Field(max_length=100)
    subject_confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    unit: str = Field(max_length=100)
    unit_confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    selection_reason: str = Field(default="", max_length=2000)
    items: list[Candidate] = Field(max_length=30)
    weak_candidates: list[WeakCandidate] = Field(default_factory=list, max_length=30)
