import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DEMO_PASSWORD = "TempPass1!";
const ROOT_OR_WEB = process.cwd();
const OUTPUT_DIR = ROOT_OR_WEB.endsWith("apps/web")
  ? path.join(ROOT_OR_WEB, "test-results/visual-qa")
  : path.join(ROOT_OR_WEB, "apps/web/test-results/visual-qa");

mkdirSync(OUTPUT_DIR, { recursive: true });

async function loginAs(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Visual QA Passes", () => {
  test("Desktop 1440px visual inspection and screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Login
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-login.png") });

    // 2. Dashboard
    await loginAs(page, "HS000001");
    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-dashboard.png") });

    // 3. Mentor
    await page.goto("/mentor");
    await expect(page.getByRole("heading", { name: "Mentor", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-mentor.png") });

    // 4. Calendar
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: "Lịch", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-calendar.png") });

    // 5. Rooms
    await page.goto("/rooms");
    await expect(page.getByRole("heading", { name: "Phòng & Cơ sở vật chất" })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-rooms.png") });

    // 6. Admin Members
    await page.goto("/login");
    await page.fill('input[name="school_member_code"]', "IT000001");
    await page.fill('input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", { name: "Quản lý thành viên" })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-admin-members.png") });
  });

  test("Mobile 390px visual inspection and screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Dashboard
    await loginAs(page, "HS000001");
    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-dashboard.png") });

    // 2. Mobile Drawer Navigation
    await page.getByRole("button", { name: "Mở menu điều hướng" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-drawer.png") });
    await page.keyboard.press("Escape");

    // 3. Mentor
    await page.goto("/mentor");
    await expect(page.getByRole("heading", { name: "Mentor", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-mentor.png") });

    // 4. Calendar
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: "Lịch", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-calendar.png") });

    // 5. Rooms
    await page.goto("/rooms");
    await expect(page.getByRole("heading", { name: "Phòng & Cơ sở vật chất" })).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-rooms.png") });
  });
});
