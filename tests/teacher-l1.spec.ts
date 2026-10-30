import { test, expect } from "@playwright/test";

test("teacher assigns the supplied profile, edits an L1 draft and publishes only reviewed content", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "학생 관리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "누리 L1 프로필", exact: true })
    .click();
  await page.getByRole("button", { name: "첨부 예시 프로필 불러오기" }).click();
  await expect(page.getByLabel("L1 프로필 모국어")).toHaveValue("중국어");
  await page.getByRole("button", { name: "누리에게 프로필 저장" }).click();
  await page.goto("/app/create");
  await page.getByRole("button", { name: "예제 불러오기" }).click();
  const title = `L1 교사 검토 ${Date.now()}`;
  await page.getByRole("textbox", { name: /자료 제목/ }).fill(title);
  await page
    .locator(".student-check")
    .filter({ hasText: "티무르" })
    .getByRole("checkbox")
    .uncheck();
  await page.getByRole("button", { name: "지원 방식 선택" }).click();
  await expect(
    page.getByRole("checkbox", { name: "교사용 L1 재구성 에이전트 사용" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "학생별 자료 생성" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("종합 단계: 5 · 모국어: 중국어", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("교과 참고 단계: ≤3 · 재확인 필요", { exact: true }),
  ).toBeVisible();
  const original = await page
    .getByRole("textbox", { name: "s1 재구성 문장 수정", exact: true })
    .inputValue();
  const revised = `${original} 국민이 함께 정한다는 뜻을 확인해요.`;
  await page
    .getByRole("textbox", { name: "s1 재구성 문장 수정", exact: true })
    .fill(revised);
  await page
    .getByRole("combobox", { name: "민주주의 위계", exact: true })
    .selectOption("3");
  await page
    .getByRole("combobox", { name: "민주주의 처리", exact: true })
    .selectOption("elaborate");
  await page.getByLabel("민주주의 번역 수정", { exact: true }).fill("民主主义");
  await page
    .getByRole("button", { name: "검토 내용 저장 (승인 보류)", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "수정 내용을 저장했어요." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "학생에게 배포하기" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "s1 재구성 문장 수정", exact: true }),
  ).toHaveValue(revised);
  await expect(
    page.getByLabel("민주주의 번역 수정", { exact: true }),
  ).toHaveValue("民主主义");
  await page
    .getByRole("checkbox", {
      name: "원본의 의미·학생 수준·교과어 번역을 확인했어요.",
    })
    .check();
  await page.getByRole("button", { name: "이 학생의 검토 완료" }).click();
  await expect(
    page.getByRole("button", { name: "학생에게 배포하기" }),
  ).toBeEnabled();
  // An unsaved change invalidates the displayed approval immediately.
  await page
    .getByLabel("민주주의 번역 수정", { exact: true })
    .fill("民主主义 (검토 중)");
  await expect(
    page.getByRole("button", { name: "학생에게 배포하기" }),
  ).toBeDisabled();
  await page.getByLabel("민주주의 번역 수정", { exact: true }).fill("民主主义");
  await page.getByRole("button", { name: "학생에게 배포하기" }).click();
  const materialId = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("button", { name: "이해 확인 문항 만들기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃 및 역할 변경" }).click();
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto(`/app/materials/${materialId}`);
  await expect(page.getByText(revised, { exact: true })).toBeVisible();
  await expect(page.getByText("民主主义", { exact: true })).toBeVisible();
  await expect(
    page.getByText("학생 프로필과 지원 판단", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.get("/api/students/std-1/reconstruction-profile")
    ).status(),
  ).toBe(403);
});
