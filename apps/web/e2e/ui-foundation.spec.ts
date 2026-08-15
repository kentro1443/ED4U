import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const DEMO_PASSWORD = "TempPass1!";

async function loginAs(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Slice 2 UI Foundation E2E", () => {
  test("favicon and icon assets return 200 OK", async ({ page }) => {
    const faviconRes = await page.goto("/favicon.ico");
    expect(faviconRes?.status()).toBe(200);

    const iconSvgRes = await page.goto("/icon.svg");
    expect(iconSvgRes?.status()).toBe(200);
  });

  test("desktop layout (1440px) renders structured sidebar and active route state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, "HS000001");

    // Sidebar branding
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("ED4U")).toBeVisible();
    await expect(sidebar.getByText("Demo High School")).toBeVisible();

    // User profile section in sidebar
    await expect(sidebar.getByText("HS000001")).toBeVisible();

    // Active route highlight on dashboard
    const dashboardLink = sidebar.getByRole("link", { name: "Dashboard" });
    await expect(dashboardLink).toHaveAttribute("aria-current", "page");

    // Navigate to Mentor
    const mentorLink = sidebar.getByRole("link", { name: "Mentor", exact: true });
    await mentorLink.click();
    await page.waitForURL(/\/mentor$/);
    await expect(mentorLink).toHaveAttribute("aria-current", "page");
  });

  test("mobile layout (390px) renders compact header and interactive drawer with ESC close", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "HS000001");

    // Desktop sidebar hidden
    await expect(page.locator("aside")).toBeHidden();

    // Mobile header visible
    const mobileHeader = page.getByRole("banner");
    await expect(mobileHeader).toBeVisible();
    await expect(mobileHeader.getByText("ED4U")).toBeVisible();

    // Open Drawer via hamburger button
    const menuBtn = page.getByRole("button", { name: "Mở menu điều hướng" });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Drawer is open
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Match Space" })).toBeVisible();

    // Close via Escape key
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("representative pages have zero critical accessibility violations", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAs(page, "HS000001");

    const routesToCheck = ["/dashboard", "/mentor", "/calendar", "/rooms"];
    for (const route of routesToCheck) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter((v) => v.impact === "critical");
      expect(critical).toEqual([]);
    }
  });

  test("admin representative page (members) renders for ADMIN_IT and has clean a11y", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAs(page, "IT000001");
    await page.goto("/admin/members");

    await expect(page.getByRole("heading", { name: "Quản lý thành viên" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });
});
