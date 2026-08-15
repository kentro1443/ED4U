import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";

const DEMO_PASSWORD = "TempPass1!";

async function loginAs(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cleanupDb = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u",
});

async function cleanupStudentMentorArtifacts() {
  const membership = await cleanupDb.query<{ userId: string; tenantId: string }>(
    `SELECT "userId", "tenantId" FROM "SchoolMembership" WHERE "schoolMemberCode" = $1 LIMIT 1`,
    ["HS000001"],
  );
  const row = membership.rows[0];
  if (!row) return;

  await cleanupDb.query('DELETE FROM "MentorBooking" WHERE "studentId" = $1', [row.userId]);
  await cleanupDb.query('DELETE FROM "Notification" WHERE "tenantId" = $1 AND "entityType" = $2', [
    row.tenantId,
    "MentorBooking",
  ]);
  await cleanupDb.query('DELETE FROM "AuditEvent" WHERE "actorId" = $1 AND "action" = $2', [
    row.userId,
    "MENTOR_BOOKING_CREATE",
  ]);
  await cleanupDb.query(
    `DELETE FROM "MentorRecommendationRun" WHERE "requestId" IN (SELECT "id" FROM "MentorMatchRequest" WHERE "studentId" = $1 AND "tenantId" = $2)`,
    [row.userId, row.tenantId],
  );
  await cleanupDb.query(
    'DELETE FROM "MentorMatchRequest" WHERE "studentId" = $1 AND "tenantId" = $2',
    [row.userId, row.tenantId],
  );
}

test.describe("Slice 3: Mentor E2E & Match Space 2.0 User Journey", () => {
  test.beforeEach(async () => {
    await cleanupStudentMentorArtifacts();
  });

  test.afterAll(async () => {
    await cleanupStudentMentorArtifacts();
    await cleanupDb.end();
  });
  test("mentor list displays real names and intelligence composer", async ({ page }) => {
    await loginAs(page, "HS000001");
    await page.goto("/mentor");

    // Check header and composer
    await expect(page.getByRole("heading", { name: "Mentor", level: 1 })).toBeVisible();
    await expect(page.getByText("Bạn đang muốn cải thiện mục tiêu gì?")).toBeVisible();

    // Verify candidate mentors list
    const mentorLinks = page.locator('ul li a[href^="/mentor/"]:not([href*="match-space"])');
    const names = await mentorLinks.allInnerTexts();
    expect(names.length).toBeGreaterThan(3);
    for (const name of names) {
      expect(name.trim()).not.toMatch(UUID);
    }
  });

  test("full student journey: prompt composer -> constraint tuning -> engine run -> Match Space 2.0 -> booking", async ({
    page,
  }) => {
    await loginAs(page, "HS000001");
    await page.goto("/mentor");

    // 1. Enter prompt with adequate budget for recommended mentor
    const promptArea = page.locator("#mentor-prompt");
    await promptArea.fill(
      "Em IELTS khoảng 6.0, Writing yếu, muốn lên 7.0. Em rảnh tối thứ 3 và thứ 5, ngân sách khoảng 500k/giờ. Em thích mentor dạy có cấu trúc.",
    );

    // 2. Click parse & tune
    await page.getByRole("button", { name: "Tìm mentor phù hợp" }).click();

    // 3. Confirmation Drawer opens
    await expect(page.getByText("Xác nhận & Tùy chỉnh tiêu chí tìm kiếm")).toBeVisible();

    // Verify parsed values in drawer
    await expect(page.locator("select#domain")).toHaveValue("IELTS");
    await expect(page.locator('input[id="currentScore"]')).toHaveValue("6");
    await expect(page.locator('input[id="targetScore"]')).toHaveValue("7");
    await expect(page.locator('input[id="maxBudget"]')).toHaveValue("500000");

    // 4. Click Run Engine
    await page.getByRole("button", { name: /Chạy Mentor Engine/ }).click();

    // 5. Redirected to /mentor/match-space?run=...
    await page.waitForURL(/\/mentor\/match-space\?run=/);
    await expect(page.getByRole("heading", { name: "Mentor Match Space", level: 1 })).toBeVisible();

    // 6. Match Space 2.0 UI checks
    await expect(page.getByLabel("Mentor Match Space Radar")).toBeVisible();
    await expect(page.getByTestId("constraint-lens")).toBeVisible();
    await expect(page.getByTestId("mentor-detail")).toBeVisible();
    await expect(page.getByTestId("match-table")).toBeVisible();

    // Verify radar score rings: check integer label 100 or 80
    await expect(page.locator('svg text:has-text("100")')).toBeVisible();

    // 7. Verify factual engine reasons in detail panel for top recommended mentor
    await expect(page.getByRole("heading", { name: /Lý do phù hợp chính/ })).toBeVisible();

    // 8. Open booking drawer for top recommended mentor
    await page
      .getByRole("button", { name: /Đặt lịch học với/ })
      .first()
      .click();
    await expect(page.getByText("Xác nhận đặt lịch hẹn")).toBeVisible();

    // Select open slot (e.g. Thứ Bảy, 09:00)
    await page.getByRole("radio", { name: /Thứ Bảy/ }).click();

    // Confirm booking
    await page.getByRole("button", { name: "Xác nhận đặt lịch hẹn" }).click();
    await expect(page.getByText("Đặt lịch hẹn thành công!")).toBeVisible();
  });

  test("mentor profile page provides real credentials and live booking card", async ({ page }) => {
    await loginAs(page, "HS000001");
    await page.goto("/mentor");

    // Click on Nguyễn Thu Hà in the directory grid
    const mentorLink = page.getByRole("link", { name: "Nguyễn Thu Hà" });
    await mentorLink.click();

    await page.waitForURL(/\/mentor\/[0-9a-f-]/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nguyễn Thu Hà");

    // Verify information cards
    await expect(page.getByText("Thông tin chuyên môn & Giảng dạy")).toBeVisible();
    await expect(page.getByText("Đặt lịch học cùng Mentor")).toBeVisible();

    // Select a non-conflicting slot (e.g. Thứ Năm, 19:00)
    await page.getByRole("radio", { name: /Thứ Năm/ }).click();

    // Place a booking from profile
    const bookButton = page.getByRole("button", { name: "Xác nhận đặt lịch hẹn" });
    if (await bookButton.isEnabled()) {
      await bookButton.click();
      await expect(page.getByText("Đặt lịch hẹn thành công!")).toBeVisible();
    }
  });

  test("persisted recommendation run is private to its student owner", async ({ page }) => {
    await loginAs(page, "HS000001");
    await page.goto("/mentor");
    await page.locator("#mentor-prompt").fill("IELTS Writing tối thứ 3 ngân sách 500k/giờ");
    await page.getByRole("button", { name: "Tìm mentor phù hợp" }).click();
    await expect(page.getByText("Xác nhận & Tùy chỉnh tiêu chí tìm kiếm")).toBeVisible();
    await page.getByRole("button", { name: /Chạy Mentor Engine/ }).click();
    await page.waitForURL(/\/mentor\/match-space\?run=/);
    const privateRunUrl = page.url();

    await page.context().clearCookies();
    await loginAs(page, "HS000002");
    await page.goto(privateRunUrl);
    await expect(page.getByText("Không thể truy cập kết quả gợi ý")).toBeVisible();
    await expect(page.getByTestId("match-table")).toHaveCount(0);
  });

  test("non-student roles never receive an actionable mentor booking control", async ({ page }) => {
    await loginAs(page, "HS990002");
    await page.goto("/mentor");
    const firstProfile = page.locator('a[href^="/mentor/"]:not([href*="match-space"])').first();
    await firstProfile.click();
    await expect(
      page.getByText("Chức năng đặt lịch chỉ dành cho học sinh đang theo học"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Xác nhận đặt lịch hẹn" })).toHaveCount(0);
  });

  test("visual QA responsive check on Match Space (1440px desktop & 390px mobile)", async ({
    page,
  }) => {
    await loginAs(page, "HS000001");

    // First ensure a run exists or navigate to /mentor to create a fresh run
    await page.goto("/mentor");
    const promptArea = page.locator("#mentor-prompt");
    await promptArea.fill("Tìm mentor SAT Math 1450 rảnh chiều T6 tối đa 500k");
    await page.getByRole("button", { name: "Tìm mentor phù hợp" }).click();
    await expect(page.getByText("Xác nhận & Tùy chỉnh tiêu chí tìm kiếm")).toBeVisible();
    await page.getByRole("button", { name: /Chạy Mentor Engine/ }).click();
    await page.waitForURL(/\/mentor\/match-space\?run=/);

    // Desktop 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId("mentor-detail")).toBeVisible();
    await expect(page.getByTestId("match-table")).toBeVisible();

    // Mobile 390px
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("mentor-detail")).toBeVisible();
    await expect(page.getByTestId("match-table")).toBeVisible();
  });
});
