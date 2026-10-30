import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page, role: "teacher" | "student" = "teacher") {
  await page.goto("/");
  if (role === "student")
    await page.getByRole("button", { name: "학생이에요" }).click();
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /반가워요/ }),
  ).toBeVisible();
}

test("teacher creates, individually reviews, publishes, then student reads and answers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page
    .getByRole("link", { name: "맞춤 자료 만들기", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "예제 불러오기" }).click();
  const title = `브라우저 검증 자료 ${Date.now()}`;
  await page.getByRole("textbox", { name: /자료 제목/ }).fill(title);
  await page.getByRole("button", { name: "지원 방식 선택" }).click();
  await page.getByRole("button", { name: "학생별 자료 생성" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "학생에게 배포하기" }),
  ).toBeDisabled();
  for (const name of ["누리", "티무르"]) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await page
      .getByRole("checkbox", {
        name: "원본의 의미·학생 수준·교과어 번역을 확인했어요.",
      })
      .check();
    await page.getByRole("button", { name: "이 학생의 검토 완료" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "이 학생의 자료 검토를 저장했어요." }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "학생에게 배포하기" }).click();
  await expect(
    page.getByRole("button", { name: "이해 확인 문항 만들기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이해 확인 문항 만들기" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "이해 확인 문항이 준비되었어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃 및 역할 변경" }).click();
  await enter(page, "student");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "나의 수업 자료", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "더 배울래요" }).first().click();
  await page
    .getByRole("textbox", { name: "나의 메모", exact: true })
    .fill("민주주의의 뜻을 다시 배웠어요.");
  await page.getByRole("button", { name: "단어장·메모 저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "단어장과 나의 메모를 저장했어요." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "나의 메모" })).toHaveValue(
    "민주주의의 뜻을 다시 배웠어요.",
  );
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "이해 확인", exact: true })
    .click();
  await page
    .locator(".quiz-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("link", { name: "시작하기" })
    .click();
  await expect(page.locator(".question-explanation")).toHaveCount(0);
  const questions = page.locator(".quiz-question");
  for (const [i, answer] of [0, 1, 2, 0].entries())
    await questions.nth(i).getByRole("radio").nth(answer).check();
  await page.getByRole("button", { name: "답 제출하고 함께 확인하기" }).click();
  await expect(
    page.getByRole("heading", { name: "잘 이해했어요!" }),
  ).toBeVisible();
  await expect(page.locator(".result-score")).toContainText("4");
  await expect(page.locator(".question-explanation")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("student completes self-check, roadmap activity and teacher message", async ({
  page,
}) => {
  await enter(page, "student");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "한국어 자가 점검" })
    .click();
  await page.getByRole("button", { name: "나의 자가 점검 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "나의 출발점을 기록했어요!" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "나의 배움길 보기" }).click();
  await page
    .getByRole("button", { name: "시작하기", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("radio").first().check();
  await page.getByRole("button", { name: "답 확인하기" }).click();
  await expect(
    page.getByText("잘했어요! 학습 기록을 저장했어요."),
  ).toBeVisible();
  await page.getByRole("button", { name: "배움길로 돌아가기" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "선생님과 이야기" })
    .click();
  const text = `선생님, 수업 자료를 잘 읽었어요. ${Date.now()}`;
  await page.getByRole("textbox", { name: "메시지 내용" }).fill(text);
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

test("mobile dashboard has usable navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(
    page.getByRole("heading", { name: "김하늘 선생님, 반가워요 👋" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "학생 관리" })
    .click();
  await expect(
    page.getByRole("heading", { name: "우리 반 학생", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
