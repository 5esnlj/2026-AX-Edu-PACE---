import { test, expect } from "@playwright/test";
test("teacher sees configuration separately from real Solar probe results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "데모 교실 입장하기" }).click();
  await page.goto("/app/create");
  const panel = page.getByRole("region", { name: "Solar 연결 상태" });
  await expect(panel).toContainText("현재 규칙 기반 데모 모드");
  await expect(
    panel.getByRole("button", { name: "Solar 실제 연결 확인" }),
  ).toBeDisabled();
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { provider: "solar", configured: true, model: "solar-test" },
    }),
  );
  await panel.getByRole("button", { name: "설정 새로고침" }).click();
  await expect(panel).toContainText("키 입력 확인");
  await page.route("**/api/agent/check", (route) =>
    route.fulfill({
      json: {
        connected: true,
        model: "solar-test",
        checked_at: new Date().toISOString(),
      },
    }),
  );
  await panel.getByRole("button", { name: "Solar 실제 연결 확인" }).click();
  await expect(panel.getByRole("status")).toContainText("연결 확인 성공");
  await page.route("**/api/agent/check", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Solar 사용 한도에 도달했습니다." },
    }),
  );
  await panel.getByRole("button", { name: "Solar 실제 연결 확인" }).click();
  await expect(panel.getByRole("status")).toContainText("사용 한도");
  await expect(panel.getByRole("status")).not.toContainText("연결 확인 성공");
});
