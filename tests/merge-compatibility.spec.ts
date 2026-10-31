import { expect, test } from "@playwright/test";

test("previous self-study URL uses the complete student flow and preserves unit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page
    .getByRole("combobox", { name: "예시 학생 선택" })
    .selectOption("std-example-a");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto("/app/self-study");
  await expect(
    page.getByRole("heading", { name: "내 자료 재구성하기", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "나의 수업 자료" }),
  ).toHaveClass(/active/);
  await page
    .getByLabel("자료 제목", { exact: true })
    .fill("기존 경로에서 만든 자료");
  await page.getByLabel("단원 (선택)").fill("민사 재판");
  await page
    .getByLabel("수업 자료 원문", { exact: true })
    .fill(
      "민사 재판은 개인 사이의 다툼을 해결하는 재판이다. 원고는 재판을 청구하는 사람이다.",
    );
  await page
    .getByRole("button", { name: "나에게 맞게 재구성", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/my-materials\/student-material-/);
  await page.reload();
  await expect(
    page.getByText("사회 · 민사 재판 · 나만의 학습 자료", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "학습 완료", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "이해 확인 문항을 풀어 볼래요" }),
  ).toBeVisible();
});

test("old self-study records stay owner-readable after the merge", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  const response = await page.request.post("/api/my-materials", {
    data: {
      title: "이전 자기주도학습 자료",
      subject: "사회",
      unit: "민사 재판",
      source_text:
        "민사 재판은 개인 사이의 다툼을 해결하는 재판이다. 원고는 재판을 청구하는 사람이다.",
    },
  });
  expect(response.status()).toBe(201);
  const item = await response.json();
  await page.goto(`/app/materials/${item.id}`);
  await expect(
    page.getByRole("heading", { name: item.title, level: 1 }),
  ).toBeVisible();
  await page.request.post("/api/demo/session", {
    data: { role: "student", student_id: "std-2" },
  });
  expect((await page.request.get(`/api/materials/${item.id}`)).status()).toBe(
    404,
  );
});
