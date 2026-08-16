import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end proof that authorization is enforced by the server, not by the
 * sidebar. Each role logs in for real and requests every guarded URL directly.
 *
 * Demo accounts come from the deterministic seed (`npm run db:demo:reset`), so
 * these tests never depend on a password someone changed by hand.
 */

const DEMO_PASSWORD = "TempPass1!";

const ROUTES = [
  "/admin/members",
  "/admin/timetable",
  "/admin/rooms",
  "/admin/approvals",
  "/admin/moderation",
  "/admin/audit",
  "/admin/settings",
] as const;

type Route = (typeof ROUTES)[number];

const EXPECTED: Record<string, { code: string; allowed: Route[] }> = {
  STUDENT: { code: "HS000001", allowed: [] },
  TEACHER: { code: "GV000001", allowed: [] },
  SCHOOL_ADMIN: {
    code: "AD000001",
    allowed: [
      "/admin/timetable",
      "/admin/rooms",
      "/admin/approvals",
      "/admin/moderation",
      "/admin/audit",
    ],
  },
  ADMIN_IT: { code: "IT000001", allowed: ["/admin/members", "/admin/audit", "/admin/settings"] },
};

async function loginAs(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  // The E2E server runs with DEMO_SKIP_PASSWORD_CHANGE=true so the seeded
  // password is never mutated by a test run.
  await page.waitForURL(/\/dashboard/);
}

for (const [role, { code, allowed }] of Object.entries(EXPECTED)) {
  test(`${role} may reach exactly its permitted admin routes`, async ({ page }) => {
    await loginAs(page, code);

    for (const route of ROUTES) {
      const response = await page.goto(route);
      if (allowed.includes(route)) {
        expect(response?.status(), `${role} should load ${route}`).toBe(200);
        await expect(page).toHaveURL(new RegExp(`${route}$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      } else {
        // The guarded page never renders: the actor is bounced to /403 before
        // any protected query runs.
        await expect(page, `${role} must be denied ${route}`).toHaveURL(/\/403$/);
        await expect(page.getByRole("heading", { name: "Không đủ quyền" })).toBeVisible();
      }
    }
  });
}

test("a denied page leaks none of its content", async ({ page }) => {
  await loginAs(page, "HS000001"); // STUDENT
  await page.goto("/admin/members");
  const body = await page.locator("body").innerHTML();
  // Markers unique to the members screen must be absent from the response.
  expect(body).not.toContain("Username = school_member_code");
  expect(body).not.toContain("HS990001");
  await expect(page).toHaveURL(/\/403$/);
});

test("an unauthenticated visitor is sent to login, never to an admin page", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("a student sees only their own appointments", async ({ page }) => {
  await loginAs(page, "HS000001");
  const response = await page.goto("/appointments");
  expect(response?.status()).toBe(200);
  // The seed gives HS000001 at most their own appointments; no other student's
  // title may appear on the page.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lịch hẹn");
  await expect(page.locator("body")).not.toContainText("Hẹn của B");
});

test("a mentor has strict navigation isolation and cannot read or leak discussion data", async ({
  page,
}) => {
  // Login as real mentor HS990002 (Trần Minh Khôi)
  await loginAs(page, "HS990002");

  // 1. Navigation verification: Discussion Hub and operational routes are hidden from sidebar
  const sidebar = page.locator("aside");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Diễn đàn" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Đơn từ" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Lịch hẹn" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Phòng học", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Câu lạc bộ" })).toHaveCount(0);

  // Permitted items are visible
  await expect(sidebar.getByRole("link", { name: "Tổng quan" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Mentor", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Không gian ghép nối" })).toBeVisible();

  // 2. Direct URL access to /discussion must be strictly blocked and leak NO data
  await page.goto("/discussion");
  await expect(page.getByText("Không có quyền truy cập diễn đàn")).toBeVisible();
  await expect(
    page.getByText("Tài khoản Mentor cựu học sinh không tham gia diễn đàn"),
  ).toBeVisible();

  // Verify that forum categories, cards and thread lists are NOT in DOM/HTML
  const bodyHtml = await page.locator("main").innerHTML();
  expect(bodyHtml).not.toContain("chủ đề");
  expect(bodyHtml).not.toContain("phản hồi");
  expect(bodyHtml).not.toContain("Học tập");
  expect(bodyHtml).not.toContain("CLB");
});
