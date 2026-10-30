import { test, expect } from "@playwright/test";

test("civil PDF example is reviewed, saved and published with phrase support", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/가나다계단/);
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto("/app/materials");
  await page.getByRole("link", { name: "민사 재판 예시로 만들기" }).click();
  await page
    .getByRole("button", { name: "민사 재판 예시 불러오기", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "원본 수업 자료 텍스트" }),
  ).toHaveValue(/민사소송법 제87조/);
  await page
    .getByText("예시 진단 프로필 연결하기 (선택)", { exact: true })
    .click();
  const profiles = await page.request
    .get("/api/l1/civil-trial-example")
    .then((r) => r.json());
  const profileIndex = profiles.profiles.findIndex(
    (p: { profile: { skills: { reading: number } } }) =>
      p.profile.skills.reading === 2,
  );
  expect(profileIndex).toBeGreaterThanOrEqual(0);
  await page
    .getByRole("combobox", { name: "시연 프로필", exact: true })
    .selectOption(String(profileIndex));
  await page
    .getByRole("combobox", { name: "프로필을 연결할 학생" })
    .selectOption("std-1");
  await expect(
    page.getByRole("button", { name: "시연 프로필 연결", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /선택한 학생의 기존 L1 프로필/ })
    .check();
  await page
    .getByRole("button", { name: "시연 프로필 연결", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "선택한 학생에게 예시 프로필을 연결했어요." }),
  ).toBeVisible();
  const title = `민사 재판 교사 검토 ${Date.now()}`;
  await page.getByRole("textbox", { name: /자료 제목/ }).fill(title);
  await page
    .locator(".student-check")
    .filter({ hasText: "티무르" })
    .getByRole("checkbox")
    .uncheck();
  await page.getByRole("button", { name: "지원 방식 선택" }).click();
  await page
    .getByRole("button", { name: "학생별 자료 생성", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const mid = page.url().split("/").at(-1)!;
  const material = await page.request
    .get(`/api/materials/${mid}`)
    .then((r) => r.json());
  const sentences = material.variants["std-1"].reconstruction.key_sentences;
  const changed = sentences.filter((s: { swaps: unknown[] }) => s.swaps.length);
  expect(changed.length).toBeGreaterThan(1);
  const fixed = sentences.find((s: { fixed: boolean }) => s.fixed);
  await expect(
    page.getByRole("textbox", {
      name: `${fixed.id} 재구성 문장 수정`,
      exact: true,
    }),
  ).toHaveAttribute("readonly", "");
  await page
    .getByRole("button", {
      name: `${changed[0].id} 원문으로 되돌리기`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: `${changed[0].id} 재구성 문장 수정`,
      exact: true,
    }),
  ).toHaveValue(changed[0].source);
  await page
    .getByRole("button", { name: "검토 내용 저장 (승인 보류)", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "수정 내용을 저장했어요." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", {
      name: `${changed[0].id} 재구성 문장 수정`,
      exact: true,
    }),
  ).toHaveValue(changed[0].source);
  await page
    .getByRole("checkbox", {
      name: "원본의 의미·학생 수준·교과어 번역을 확인했어요.",
    })
    .check();
  await page
    .getByRole("button", { name: "이 학생의 검토 완료", exact: true })
    .click();
  await page
    .getByRole("button", { name: "학생에게 배포하기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "이해 확인 문항 만들기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃 및 역할 변경" }).click();
  await page.getByRole("button", { name: "학생이에요" }).click();
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto(`/app/materials/${mid}`);
  const phrase = page.locator(".reading-body .changed-phrase button").first();
  await phrase.click();
  await expect(
    page.locator(".reading-body .phrase-original").first(),
  ).toBeVisible();
  const explanation = page
    .locator(".reading-body .reading-explanation")
    .first();
  await expect(explanation).not.toHaveAttribute("open", "");
  await explanation.locator("summary").click();
  await expect(explanation).toHaveAttribute("open", "");
  const studentData = await page.request
    .get(`/api/materials/${mid}`)
    .then((r) => r.json());
  expect(studentData.variants["std-1"].reconstruction).toBeUndefined();
  expect(studentData.variants["std-1"].reading_support.length).toBeGreaterThan(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
