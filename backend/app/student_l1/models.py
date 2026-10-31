"""Student-facing contracts adapted from the supplied L1 workflow."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MaterialInput(Model):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    subject: Literal["사회", "과학", "수학", "국어"]
    source_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=40000)]


class Sentence(Model):
    id: Short
    source: Text
    rewritten: Text


class Vocabulary(Model):
    term: Short
    tier: Literal["1", "2-1", "2-2", "2-3", "3", "unknown_needs_teacher"]
    translation: str = Field(default="", max_length=300)
    simple_meaning: str = Field(default="", max_length=2000)
    action: Literal["retain", "elaborate", "simplify"]


class VisualAid(Model):
    kind: Literal["sequence", "list", "comparison", "venn", "other"]
    title: Short
    description: Text
    items: list[Short] = Field(min_length=1, max_length=12)
    source_sentence_ids: list[Short] = Field(min_length=1, max_length=30)


class MaterialOutput(Model):
    sentences: list[Sentence] = Field(min_length=1, max_length=100)
    vocabulary: list[Vocabulary] = Field(max_length=30)
    visual_aids: list[VisualAid] = Field(max_length=5)


class FairnessReview(Model):
    level_fit: Literal[True]
    source_grounded: Literal[True]
    learning_goal_aligned: Literal[True]
    non_discriminatory: Literal[True]
    sufficient_information: Literal[True]
    unambiguous_answer: Literal[True]


class Question(Model):
    id: Short
    type: Literal["true_false", "short_answer", "multiple_choice_4"]
    learning_objective: Short
    prompt: Text
    choices: list[Short] = Field(max_length=4)
    correct_answer: Short
    accepted_answers: list[Short] = Field(default_factory=list, max_length=10)
    explanation: Text
    source_sentence_ids: list[Short] = Field(min_length=1, max_length=30)
    review: FairnessReview

    @model_validator(mode="after")
    def valid_choices(self):
        if self.type == "true_false" and self.choices != ["O", "X"]:
            raise ValueError("O/X 문항에는 O, X 두 선택지가 필요합니다.")
        if self.type == "multiple_choice_4" and len(set(self.choices)) != 4:
            raise ValueError("4지선다에는 서로 다른 네 선택지가 필요합니다.")
        if self.type == "short_answer":
            if self.choices:
                raise ValueError("주관식에는 선택지가 없습니다.")
        elif self.correct_answer not in self.choices:
            raise ValueError("정답이 선택지에 없습니다.")
        return self


class AssessmentOutput(Model):
    items: list[Question] = Field(min_length=1, max_length=6)


class OptIn(Model):
    opt_in: StrictBool


class Answers(Model):
    answers: dict[str, Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]] = Field(min_length=1, max_length=6)
