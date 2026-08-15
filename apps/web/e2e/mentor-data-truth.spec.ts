import { test, expect, type Page } from "@playwright/test";

/**
 * Browser-level proof that the mentor surfaces show real data.
 *
 * The prototype rendered 25 raw UUIDs, every one scored 50, because the engine
 * never ran. These assertions fail if any of that comes back.
 */

const DEMO_PASSWORD = "TempPass1!";

async function loginAs(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("the mentor list shows real names, not identifiers", async ({ page }) => {
  await loginAs(page, "HS000001");
  await page.goto("/mentor");

  const names = await page.locator('li a[href^="/mentor/"]').allInnerTexts();
  expect(names.length).toBeGreaterThan(5);
  for (const name of names) {
    expect(name.trim()).not.toMatch(UUID);
  }
  await expect(page.getByRole("link", { name: "Nguyễn Thu Hà" })).toBeVisible();
});

test("Match Space visualises a real engine run", async ({ page }) => {
  await loginAs(page, "HS000001");
  await page.goto("/mentor/match-space");

  // The engine ran: no validation-failure banner.
  await expect(page.getByText("Không chạy được Mentor Engine.")).toHaveCount(0);

  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();

  const names = await rows.locator("td:first-child button").allInnerTexts();
  for (const name of names) {
    expect(name.trim()).not.toMatch(UUID);
  }

  // Real scores, spread apart. The prototype gave every mentor exactly 50.
  const scoreCells = await rows.locator("td:nth-child(2)").allInnerTexts();
  const scores = scoreCells.map((text) => Number(text));
  const eligibleScores = scores.filter((score) => score > 0);
  expect(eligibleScores.length).toBeGreaterThan(1);
  expect(new Set(eligibleScores).size).toBe(eligibleScores.length);
  expect(scores.every((score) => score === 50)).toBe(false);

  // Rejections carry the engine's own reasons.
  await expect(
    page.getByRole("cell", { name: /AVAILABILITY|PRICE|DOMAIN|UNVERIFIED/ }).first(),
  ).toBeVisible();
});

test("a mentor profile distinguishes unchecked credentials from absent ones", async ({ page }) => {
  await loginAs(page, "HS000001");
  await page.goto("/mentor");

  // Trần Minh Khôi holds a checked IELTS certificate.
  await page.getByRole("link", { name: "Trần Minh Khôi" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Trần Minh Khôi");
  await expect(page.getByText("IELTS: 7.5")).toBeVisible();
  // A credential nobody checked is never reported as one the mentor lacks.
  await expect(page.getByText("đã kiểm tra, không có chứng chỉ")).toHaveCount(0);
});
