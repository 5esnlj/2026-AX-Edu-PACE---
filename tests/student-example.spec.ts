import { test, expect } from "@playwright/test";
test("PDF example appears with imported diagnosis and a ready learning path", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto("/app/students");
  const row = page.getByRole("row").filter({ hasText: "학생 A" });
  await expect(row).toContainText("첨부 PDF 예시");
  await expect(row).toContainText("5+수준");
  await row.getByRole("link", { name: "진단 보기·채점" }).click();
  await expect(
    page.getByText("[해커톤 개발] 학생 예시.pdf", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".diagnostic-results")).toContainText("0.46");
  await expect(page.locator(".personal-path-card").first()).toContainText(
    "교과 개념",
  );
  await page.reload();
  await expect(page.locator(".diagnostic-results")).toContainText("추측 의심");
  await page.getByRole("button", { name: "로그아웃 및 역할 변경" }).click();
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page
    .getByRole("combobox", { name: "예시 학생 선택" })
    .selectOption("std-example-a");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto("/app/diagnostic");
  await expect(
    page.getByText("첨부 자료에서 가져온 학생 예시의 진단 결과예요.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "나의 배움길 보기", exact: true })
    .click();
  await expect(page.locator(".personal-path-card").nth(1)).toContainText(
    "말하기",
  );
  await expect(page.locator(".personal-path-card").nth(2)).toContainText(
    "사회",
  );
});
