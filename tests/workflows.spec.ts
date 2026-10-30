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

test("six-level diagnosis resumes drafts, waits for teacher grading and creates a personal path", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page, "student");
  await page.goto("/app/roadmap");
  await expect(
    page.getByRole("heading", { name: "먼저 나의 출발점을 알아봐요" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "한국어 자가 점검 시작" }).click();
  await page.getByRole("button", { name: "6수준 진단 시작하기" }).click();
  let questions = page.locator(".diagnostic-question");
  await expect(questions).toHaveCount(12);
  await questions.first().getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "임시저장했어요." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".diagnostic-question").first().getByRole("radio").nth(1),
  ).toBeChecked();
  for (const [domain, answers] of [
    ["듣기", [1, 0, 0, 0, 0, 0, 2, 1, 0, 0, 1, 1]],
    ["읽기", [1, 0, 1, 2, 0, 1, 2, 0, 1, 0, 2, 1]],
  ] as const) {
    questions = page.locator(".diagnostic-question");
    for (const [i, answer] of answers.entries())
      await questions.nth(i).getByRole("radio").nth(answer).check();
    await page.getByRole("button", { name: `${domain} 응답 제출` }).click();
    await expect(page.locator(".diagnostic-progress .current")).toHaveText(
      domain === "듣기" ? "읽기" : "쓰기",
    );
  }
  const teacherContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
  });
  const teacher = await teacherContext.newPage();
  teacher.on("pageerror", (e) => errors.push(e.message));
  await enter(teacher);
  await teacher
    .getByRole("navigation")
    .getByRole("link", { name: "학생 관리" })
    .click();
  await teacher
    .getByRole("row")
    .filter({ hasText: "누리" })
    .getByRole("link", { name: "진단 보기·채점" })
    .click();
  await expect(
    teacher.getByRole("heading", { level: 1, name: "누리의 6수준 진단" }),
  ).toBeVisible();
  for (const [qid, score] of [
    ["쓰-1", "2"],
    ["쓰-2", "0"],
    ["쓰-3", "0"],
    ["말-1", "0"],
    ["말-2", "0"],
  ]) {
    await expect(page.locator(".diagnostic-item-meta")).toContainText(qid);
    if (qid.startsWith("쓰"))
      await page
        .getByRole("textbox", { name: "나의 쓰기 응답" })
        .fill("밥, 국, 김치. 이름은 누리입니다.");
    else
      await page
        .getByRole("checkbox", { name: "녹음 대신 선생님 앞에서 말할게요" })
        .check();
    await page.getByRole("button", { name: "선생님께 과제 제출" }).click();
    await expect(
      page.getByRole("heading", { name: "선생님의 채점을 기다리고 있어요" }),
    ).toBeVisible();
    await teacher.getByRole("button", { name: "학생 응답 새로고침" }).click();
    await expect(
      teacher.getByRole("heading", { name: "제출된 과제 채점" }),
    ).toBeVisible();
    for (let i = 1; i <= 4; i++)
      await teacher
        .getByRole("combobox", { name: new RegExp(`^R${i} `) })
        .selectOption(score);
    if (qid.startsWith("말"))
      await teacher
        .getByRole("textbox", { name: /대면 말하기 관찰 기록/ })
        .fill("직접 들은 말하기 응답을 기준표와 대조했어요.");
    await teacher
      .getByRole("button", { name: "채점 저장 및 다음 과제 안내" })
      .click();
    await expect(
      teacher.getByRole("heading", { name: "제출된 과제 채점" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "채점 결과 새로고침" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "나의 출발점을 기록했어요!" }),
  ).toBeVisible();
  await expect(page.locator(".diagnostic-results")).not.toContainText(
    "교과 적응 한국어",
  );
  await teacher.screenshot({
    path: "/tmp/ganada-six-teacher.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "나의 배움길 보기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "나의 배움길" }),
  ).toBeVisible();
  await expect(page.locator(".personal-path-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "걸음 1 배움 기록" })
    .fill("선생님께 어려운 부분을 알려드렸어요.");
  await page.getByRole("button", { name: "활동 기록 저장" }).click();
  await expect(page.getByText("1 / 3개 활동 기록")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 / 3개 활동 기록")).toBeVisible();
  await page.screenshot({
    path: "/tmp/ganada-six-student.png",
    fullPage: true,
  });
  await teacher.reload();
  await expect(
    teacher.getByText("학생의 배움 기록: 선생님께 어려운 부분을 알려드렸어요."),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/app/diagnostic");
  await expect(page.locator(".diagnostic-results")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/ganada-six-mobile.png", fullPage: true });
  await page.goto("/app/messages");
  const text = `선생님, 새 진단을 완료했어요. ${Date.now()}`;
  await page.getByRole("textbox", { name: "메시지 내용" }).fill(text);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await teacherContext.close();
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
