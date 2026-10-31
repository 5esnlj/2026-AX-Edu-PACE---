import { expect, test, type Page } from "@playwright/test";

async function enterUnassessedStudent(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page
    .getByRole("combobox", { name: "예시 학생 선택" })
    .selectOption("std-5");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
}

test("an unassessed student generates T/F from a teacher lesson and saves feedback", async ({
  page,
}) => {
  await enterUnassessedStudent(page);
  const session = await (await page.request.get("/api/session")).json();
  expect(session.student.diagnostic_source).toBe("unassessed");
  const material = (await (await page.request.get("/api/materials")).json())[0];
  await page.goto(`/app/materials/${material.id}`);
  const generator = page.getByRole("region", {
    name: "학습자료 기반 문제 생성",
  });
  await expect(generator).toBeVisible();
  await generator
    .getByRole("radio", { name: "T/F (O/X)", exact: true })
    .check();
  await generator
    .getByRole("checkbox", { name: "자료를 읽었고 문제를 풀어 볼래요" })
    .check();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/student-practice") &&
      r.request().method() === "POST",
  );
  await generator
    .getByRole("button", { name: "AI 문제 만들기", exact: true })
    .click();
  const quizResponse = await response;
  expect(quizResponse.status()).toBe(201);
  const practice = await quizResponse.json();
  expect(practice.quiz.items.length).toBeGreaterThan(0);
  for (const q of practice.quiz.items) {
    expect(q.type).toBe("true_false");
    expect(q).not.toHaveProperty("correct_answer");
    await page
      .getByRole("group", { name: q.prompt })
      .getByRole("radio")
      .first()
      .check();
  }
  await page.getByRole("button", { name: "답안 제출", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "이해 확인 완료" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "이해 확인 완료" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/session")).json()).student
      .diagnostic_source,
  ).toBe("unassessed");
  await page.goto("/app/quizzes");
  await expect(
    page
      .getByRole("region", { name: "내가 만든 문제" })
      .getByRole("heading", { name: material.title }),
  ).toBeVisible();
});

test("student selects four-choice questions from pasted lesson text without diagnosis", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterUnassessedStudent(page);
  await page.goto("/app/quizzes");
  await page.getByRole("link", { name: "AI 문제 만들기", exact: true }).click();
  await page.getByRole("radio", { name: "글 직접 붙여넣기" }).check();
  await page.getByLabel("문제 제목 (선택)").fill("직접 넣은 재판 복습");
  await page
    .getByLabel("학습자료 내용")
    .fill(
      "민사 재판은 개인 사이의 다툼을 해결하는 재판이다. 원고는 재판을 청구하는 사람이다. 피고는 재판을 청구당한 사람이다. 판사는 양측의 주장과 증거를 듣고 판단한다.",
    );
  await page.getByRole("radio", { name: "4지선다", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "자료를 읽었고 문제를 풀어 볼래요" })
    .check();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/student-practice") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "AI 문제 만들기", exact: true })
    .click();
  const result = await response;
  expect(result.status()).toBe(201);
  const practice = await result.json();
  await expect(page).toHaveURL(new RegExp(`/app/practice/${practice.id}$`));
  await expect(
    page.getByRole("heading", { name: "직접 넣은 재판 복습", level: 1 }),
  ).toBeVisible();
  for (const q of practice.quiz.items) {
    expect(q.type).toBe("multiple_choice_4");
    expect(new Set(q.choices).size).toBe(4);
    await expect(
      page.getByRole("group", { name: q.prompt }).getByRole("radio"),
    ).toHaveCount(4);
  }
  await expect(page.locator(".question-explanation")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
