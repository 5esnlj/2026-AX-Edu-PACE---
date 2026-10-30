import { test, expect } from "@playwright/test";

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "수업 자료", exact: true })
    .click();
  await page.getByRole("link", { name: "오역 탐지", exact: true }).click();
}

test("teacher selects L2, resolves context, inspects evidence and reopens a saved report", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect(
    page.getByRole("heading", { name: "수업 자료 오역 탐지" }),
  ).toBeVisible();
  await page
    .getByText("이미지에서 추가한 대역표 · 3개 용어 × 5개 언어", {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("cell", { name: "иск представитель", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "nguyên cáo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "오역 검토 예제 불러오기" }).click();
  const title = `L2 브라우저 검토 ${Date.now()}`;
  await page
    .getByRole("textbox", { name: "검토 제목", exact: true })
    .fill(title);
  await page
    .getByRole("combobox", { name: "교과", exact: true })
    .selectOption("");
  await page
    .getByRole("textbox", { name: "단원 (비우면 자동 추정)", exact: true })
    .fill("");
  await page
    .getByRole("button", { name: "오역 검토 실행", exact: true })
    .click();
  await expect(
    page.getByText("분석 보류 · 교과·단원 선택 필요", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".l2-candidate")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "교과", exact: true })
    .selectOption("사회");
  await page
    .getByRole("textbox", { name: "단원 (비우면 자동 추정)", exact: true })
    .fill("재판의 당사자");
  await page
    .getByRole("button", { name: "오역 검토 실행", exact: true })
    .click();
  await expect(page.locator(".l2-candidate")).toHaveCount(1);
  await expect(
    page
      .locator(".l2-candidate")
      .getByRole("heading", { name: "원고", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".l2-candidate").getByText("原告", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".l2-candidate")
      .getByText("약한 후보 · 확인 필요", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".l2-history")
    .getByRole("button", { name: title, exact: true })
    .first()
    .click();
  await expect(page.locator(".l2-candidate")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "검토 제목", exact: true }),
  ).toHaveValue(title);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("existing materials load into L2 and student access is blocked", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/app/materials/lesson-demo");
  await page
    .getByRole("link", { name: "이 자료의 오역 탐지 (L2) 열기", exact: true })
    .click();
  await page.getByRole("button", { name: "선택한 자료 불러오기" }).click();
  await expect(
    page.getByRole("textbox", { name: "검토할 원문·번역 텍스트", exact: true }),
  ).toHaveValue(/민주주의: dân chủ/);
  await expect(
    page.getByRole("combobox", { name: "번역 언어", exact: true }),
  ).toHaveValue("vi");
  await page.getByRole("button", { name: "로그아웃 및 역할 변경" }).click();
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto("/app/materials");
  await expect(
    page.getByRole("link", { name: "오역 탐지", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/translation-reviews")).status()).toBe(
    403,
  );
  await page.goto("/app/materials/translation-review");
  await expect(
    page.getByRole("heading", { name: "수업 자료 오역 탐지" }),
  ).toHaveCount(0);
});
