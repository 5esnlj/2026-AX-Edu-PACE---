"""Small, validated material-based practice contract."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, model_validator

QuestionType = Literal["true_false", "multiple_choice_4"]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Choice = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GenerateInput(Model):
    source_kind: Literal["material", "student_material", "text"]
    source_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)] | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    source_text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40000)] = ""
    question_type: QuestionType
    learning_completed: StrictBool
    opt_in: StrictBool

    @model_validator(mode="after")
    def source_selection(self):
        if self.source_kind == "text":
            if self.source_id is not None or len(self.source_text) < 20:
                raise ValueError("직접 입력은 20자 이상의 학습자료가 필요합니다.")
        elif not self.source_id or self.source_text:
            raise ValueError("저장된 자료를 선택해 주세요.")
        return self


class Question(Model):
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    type: QuestionType
    prompt: Text
    choices: list[Choice] = Field(min_length=2, max_length=4)
    correct_answer: Choice
    explanation: Text
    source_sentence_ids: list[Annotated[str, StringConstraints(min_length=1, max_length=60)]] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def choices_match(self):
        if self.type == "true_false" and self.choices != ["O", "X"]:
            raise ValueError("T/F 문항에는 O와 X 두 선택지가 필요합니다.")
        if self.type == "multiple_choice_4" and len(set(self.choices)) != 4:
            raise ValueError("서로 다른 네 선택지가 필요합니다.")
        if self.correct_answer not in self.choices:
            raise ValueError("정답은 선택지 중 하나여야 합니다.")
        return self


class Output(Model):
    items: list[Question] = Field(min_length=1, max_length=3)


class Answers(Model):
    answers: dict[str, Choice] = Field(min_length=1, max_length=3)
