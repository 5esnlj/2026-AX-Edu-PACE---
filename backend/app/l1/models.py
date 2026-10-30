from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]
Level = Annotated[int, Field(strict=True, ge=1, le=6)] | Annotated[str, StringConstraints(pattern=r"^[≤≥]?[1-6]\+?$", max_length=3)]
Tier = Literal["1", "2-1", "2-2", "2-3", "3", "unknown_needs_teacher"]
Method = Literal["easy", "bilingual", "visual"]
Action = Literal["retain", "elaborate", "simplify", "review"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Skills(Model):
    listening: Level | None = None
    reading: Level | None = None
    writing: Level | None = None
    speaking: Level | None = None


class Academic(Model):
    B: Level | None = None
    T1: Level | None = None
    T2: Level | None = None
    T3: Level | None = None
    C: Level | None = None


class SubjectProfile(Model):
    representative_level: Level | None = None
    level: Level | None = None
    comprehension_stronger_than_expression: bool = False
    recheck_required: bool = False
    uncertain: bool = False
    uncertainty_flags: list[Short] = Field(default_factory=list, max_length=10)


class LearnerProfile(Model):
    # Optional reference identifiers are never sent to the model.
    learner_id: Short | None = None
    display_name: Short | None = None
    grade: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None
    native_language: Short | None = None
    level_scale: Literal["diagnostic_1_6"] = "diagnostic_1_6"
    overall_korean_level: Level | None = None
    skills: Skills = Field(default_factory=Skills)
    academic_korean: Academic = Field(default_factory=Academic)
    bottlenecks: list[Literal["B", "T1", "T2", "T3", "C"]] = Field(default_factory=list, max_length=5)
    daily_korean_support: bool | None = None
    subject_profiles: dict[Literal["국어", "수학", "과학", "사회"], SubjectProfile] = Field(default_factory=dict)
    diagnostic_notes: list[Text] = Field(default_factory=list, max_length=10)


class PhraseSwap(Model):
    original: Short
    replacement: Short


class Sentence(Model):
    id: Short
    page: int | None = Field(default=None, ge=1, le=50)
    source: Text
    rewritten: Text
    operations: list[Literal["retain", "elaborate", "simplify"]] = Field(min_length=1, max_length=3)
    rationale: Text
    review_required: bool = True
    swaps: list[PhraseSwap] = Field(default_factory=list, max_length=3)
    explanation: OptionalText = ""
    fixed: bool = False


class Vocabulary(Model):
    term: Short
    tier: Tier
    category: Literal["general_knowledge", "curriculum_adapted", "other", "unknown"]
    source_sentence_ids: list[Short] = Field(min_length=1, max_length=30)
    required_level: Level | None = None
    learner_level: Level | None = None
    action: Action
    simple_meaning: OptionalText
    native_language: str = Field(max_length=300)
    translation: str = Field(max_length=300)
    translation_status: Literal["translated", "missing_profile_data", "missing_lexicon", "review"]
    tts_text: Short
    knowledge_state: Literal["known", "unknown", "unmarked"] = "unmarked"
    highlight: bool = False
    review_required: bool = True


class VisualAid(Model):
    needed: bool
    kind: Literal["sequence", "list", "comparison", "venn", "other", "none"]
    title: str = Field(max_length=300)
    description: OptionalText
    items: list[Short] = Field(max_length=12)
    source_sentence_ids: list[Short] = Field(max_length=30)
    alt_text: OptionalText
    visible_by_default: bool = True
    rationale: OptionalText

    @model_validator(mode="after")
    def meaningful_visible_aid(self):
        if self.needed and (self.kind == "none" or not self.title.strip() or not self.items or not self.alt_text or not self.source_sentence_ids):
            raise ValueError("시각 자료에는 제목·항목·대체 설명·원문 근거가 필요합니다.")
        return self


class Decision(Model):
    diagnosed_level: Level | None = None
    skill_profile: Skills = Field(default_factory=Skills)
    subject_profile_used: SubjectProfile = Field(default_factory=SubjectProfile)
    native_language: str = Field(max_length=300)
    methods_selected: list[Method] = Field(max_length=3)
    rationale: list[Text] = Field(min_length=1, max_length=12)


class Document(Model):
    class_name: str = Field(default="", max_length=100)
    subject: str = Field(max_length=100)
    grade: str = Field(default="", max_length=100)
    source_name: str = Field(default="", max_length=120)
    source_pdf_url: str | None = Field(default=None, max_length=300)


class Recognition(Model):
    status: Literal["success", "partial", "failed"]
    page_notes: list[Text] = Field(max_length=20)
    uncertain_spans: list[Text] = Field(max_length=20)


class TeacherReview(Model):
    required: bool = True
    editable_fields: list[Short] = Field(default_factory=list, max_length=10)
    questions: list[Text] = Field(default_factory=list, max_length=20)
    teacher_edits_applied: bool = False


class Finalization(Model):
    approved_by_teacher: bool = False
    final_document: str | None = Field(default=None, max_length=40000)


class LearnerTools(Model):
    tts_texts: list[Short] = Field(default_factory=list, max_length=30)
    vocabulary_states: dict[str, Literal["known", "unknown", "unmarked"]] = Field(default_factory=dict, max_length=30)
    visual_visibility_default: bool = True
    document_zoom_default_percent: int = Field(default=100, ge=90, le=160)
    handwriting_supported_by_host: bool | None = None


class ReconstructionOutput(Model):
    status: Literal["teacher_review_required", "teacher_approved"]
    document: Document
    learner_decision: Decision
    recognition: Recognition
    key_sentences: list[Sentence] = Field(min_length=1, max_length=60)
    vocabulary: list[Vocabulary] = Field(max_length=30)
    visual_aids: list[VisualAid] = Field(max_length=4)
    learner_tools: LearnerTools = Field(default_factory=LearnerTools)
    teacher_review: TeacherReview
    finalization: Finalization
    warnings: list[Text] = Field(max_length=30)


class SentenceEdit(Model):
    id: Short
    rewritten: Text
    explanation: OptionalText | None = None


class VocabularyEdit(Model):
    term: Short
    tier: Tier
    action: Action
    simple_meaning: OptionalText
    translation: str = Field(max_length=300)


class VisualEdit(Model):
    title: str = Field(max_length=300)
    description: OptionalText
    items: list[Short] = Field(max_length=12)
    alt_text: OptionalText
    visible_by_default: bool


class ReconstructionEdits(Model):
    sentences: list[SentenceEdit] = Field(min_length=1, max_length=60)
    vocabulary: list[VocabularyEdit] = Field(max_length=30)
    visual_aids: list[VisualEdit] = Field(max_length=4)
