import { expect, test } from "@playwright/test";
import type { StudentAttempt, StudentMaterial } from "../src/student-materials";

test("student answers three question formats and keeps answers after a failed submission", async ({
  page,
}) => {
  const material: StudentMaterial = {
    id: "student-material-ui-check",
    title: "민사 재판 개념 확인",
    subject: "사회",
    source_text:
      "원고는 재판을 청구하는 사람이다. 피고는 재판을 청구당한 사람이다.",
    result: {
      sentences: [
        {
          id: "s1",
          source: "원고는 재판을 청구하는 사람이다.",
          rewritten: "원고는 재판을 청구하는 사람이다.",
        },
      ],
      vocabulary: [
        {
          term: "원고",
          tier: "3",
          simple_meaning: "재판을 청구하는 사람",
          translation: "",
          action: "retain",
        },
      ],
      visual_aids: [],
      notice: "학습 자료에 근거한 연습이에요.",
      provider: "solar",
    },
    profile: { level: 5, native_language: null },
    completed_at: "2026-10-31T00:00:00Z",
    quiz: {
      answer_visibility: "after_submission",
      items: [
        {
          id: "q1",
          type: "true_false",
          prompt: "원고는 재판을 청구하는 사람인가요?",
          choices: ["O", "X"],
        },
        {
          id: "q2",
          type: "multiple_choice_4",
          prompt: "재판을 청구당한 사람은 누구인가요?",
          choices: ["원고", "피고", "판사", "증인"],
        },
        {
          id: "q3",
          type: "short_answer",
          prompt: "재판을 청구하는 사람을 무엇이라고 하나요?",
          choices: [],
        },
      ],
    },
    attempt: null,
    created_at: "2026-10-31T00:00:00Z",
  };
  const feedback: StudentAttempt = {
    score: 3,
    total: 3,
    notice: "이 연습 결과는 한국어 진단 수준을 바꾸지 않아요.",
    results: [
      {
        id: "q1",
        correct: true,
        selected: "O",
        correct_answer: "O",
        explanation: "첫 문장은 원고가 재판을 청구하는 사람이라고 설명해요.",
      },
      {
        id: "q2",
        correct: true,
        selected: "피고",
        correct_answer: "피고",
        explanation: "피고는 재판을 청구당한 사람이에요.",
      },
      {
        id: "q3",
        correct: true,
        selected: "원고",
        correct_answer: "원고",
        explanation: "청구하는 사람의 이름은 원고예요.",
      },
    ],
  };
  let submissions = 0;
  await page.route(`**/api/student-materials/${material.id}`, (route) =>
    route.fulfill({ json: material }),
  );
  await page.route(
    `**/api/student-materials/${material.id}/quiz/submit`,
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        answers: { q1: "O", q2: "피고", q3: "원고" },
      });
      submissions++;
      if (submissions === 1) {
        await route.fulfill({
          status: 503,
          json: { detail: "잠시 연결이 끊어졌어요. 다시 제출해 주세요." },
        });
      } else {
        material.attempt = feedback;
        await route.fulfill({ json: feedback });
      }
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto(`/app/my-materials/${material.id}?quiz=1`);
  await expect(
    page.getByRole("heading", { name: material.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "재구성한 학습 자료" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(feedback.results[0].explanation, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "답안 제출", exact: true }),
  ).toBeDisabled();
  const q1 = page.getByRole("group", { name: material.quiz!.items[0].prompt });
  const q2 = page.getByRole("group", { name: material.quiz!.items[1].prompt });
  const q3 = page.getByRole("group", { name: material.quiz!.items[2].prompt });
  await q1.getByRole("radio").first().check();
  await q2.getByRole("radio").nth(1).check();
  await q3.getByRole("textbox").fill("원고");
  await page.getByRole("button", { name: "답안 제출", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("잠시 연결이 끊어졌어요");
  await expect(q1.getByRole("radio").first()).toBeChecked();
  await expect(q2.getByRole("radio").nth(1)).toBeChecked();
  await expect(q3.getByRole("textbox")).toHaveValue("원고");
  await page.getByRole("button", { name: "답안 제출", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "이해 확인 완료", exact: true }),
  ).toBeVisible();
  for (const result of feedback.results)
    await expect(
      page.getByText(result.explanation, { exact: true }),
    ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "이해 확인 완료", exact: true }),
  ).toBeVisible();
  await expect(q3.getByRole("textbox")).toHaveValue("원고");
  await expect(q3.getByRole("textbox")).toBeDisabled();
  expect(submissions).toBe(2);
});
