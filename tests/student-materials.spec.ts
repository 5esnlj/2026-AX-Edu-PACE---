import { expect, test } from "@playwright/test";

test("student creates a private lesson, opts into assessment and reopens saved feedback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page
    .getByRole("combobox", { name: "예시 학생 선택" })
    .selectOption("std-example-a");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "나의 수업 자료", exact: true })
    .click();
  await page
    .getByRole("link", { name: "내 자료 재구성하기", exact: true })
    .first()
    .click();
  const title = `학생 재구성 확인 ${Date.now()}`;
  await page.getByLabel("자료 제목", { exact: true }).fill(title);
  await page
    .getByLabel("수업 자료 원문", { exact: true })
    .fill(
      "민사 재판은 개인 사이의 다툼을 해결하는 재판이다. 원고는 재판을 청구하는 사람이다. 피고는 재판을 청구당한 사람이다.",
    );
  await page
    .getByRole("button", { name: "나에게 맞게 재구성", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  const url = page.url();
  const id = url.split("/").pop()!;
  // The server must enforce the learning gate, even if a client bypasses the UI.
  const premature = await page.request.post(
    `/api/student-materials/${id}/quiz`,
    { data: { opt_in: true } },
  );
  expect(premature.status()).toBe(409);
  await page.getByRole("button", { name: "학습 완료", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "자료를 읽었고 문제를 풀어 볼래요",
      exact: true,
    })
    .check();
  const generated = page.waitForResponse(
    (r) =>
      r.url().endsWith("/student-practice") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "AI 문제 만들기", exact: true })
    .click();
  const generatedResponse = await generated;
  expect(generatedResponse.ok()).toBeTruthy();
  const detail = await generatedResponse.json();
  const practiceId = detail.id;
  await expect(page).toHaveURL(new RegExp(`/app/practice/${practiceId}$`));
  expect(detail.quiz.items.length).toBeGreaterThan(0);
  for (const item of detail.quiz.items) {
    expect(item).not.toHaveProperty("correct_answer");
    expect(item).not.toHaveProperty("explanation");
    const question = page.getByRole("group").filter({ hasText: item.prompt });
    if (item.type === "short_answer")
      await question.getByRole("textbox").fill("원고");
    else await question.getByRole("radio").first().check();
  }
  const submitted = page.waitForResponse((r) =>
    r.url().endsWith(`/student-practice/${practiceId}/submit`),
  );
  await page.getByRole("button", { name: "답안 제출", exact: true }).click();
  const attempt = await (await submitted).json();
  expect(attempt.results).toHaveLength(detail.quiz.items.length);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  for (const result of attempt.results) {
    await expect(
      page.getByText(result.explanation, { exact: true }).first(),
    ).toBeVisible();
  }
  await page.screenshot({
    path: test.info().outputPath("student-quiz-desktop.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath("student-quiz-mobile.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.goto("/app/materials");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto(url);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
