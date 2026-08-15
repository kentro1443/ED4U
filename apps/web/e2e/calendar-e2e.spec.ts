import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "TempPass1!";
async function login(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("real school-local calendar", () => {
  test("student week/day/month are real distinct views with concrete timetable times", async ({
    page,
  }) => {
    await login(page, "HS000001");
    await page.goto("/calendar?view=week&date=2026-08-17");
    await expect(page.getByText("17/08 – 23/08/2026")).toBeVisible();
    await expect(page.getByText("Toán · 10A1").first()).toBeVisible();
    await expect(page.getByText(/07:30–08:15/).first()).toBeVisible();
    await expect(page.getByText("Đặt phòng · R04").first()).toBeVisible();

    await page.getByRole("link", { name: "Ngày", exact: true }).click();
    await expect(page).toHaveURL(/view=day/);
    await expect(page.getByText("Thứ Hai, 17/08/2026")).toBeVisible();

    await page.getByRole("link", { name: "Tháng", exact: true }).click();
    await expect(page).toHaveURL(/view=month/);
    await expect(page.getByText(/tháng 8 năm 2026/i)).toBeVisible();
  });

  test("teacher sees their assigned CLASS timetable even without class membership", async ({
    page,
  }) => {
    await login(page, "GV000001");
    await page.goto("/calendar?view=week&date=2026-08-17");
    await expect(page.getByText(/10:10–10:55/).first()).toBeVisible();
    await expect(page.locator("text=/· 10A[1-4]/").first()).toBeVisible();
  });

  test("mobile uses accessible per-day agenda instead of squeezing the desktop grid", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "HS000001");
    await page.goto("/calendar?view=week&date=2026-08-17");
    await expect(page.getByRole("heading", { name: /T2 · 17\/08/ })).toBeVisible();
    await expect(page.getByText("Toán · 10A1").filter({ visible: true }).first()).toBeVisible();
  });
});
