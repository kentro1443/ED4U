import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const PASSWORD = "TempPass1!";
const TITLE = "E2E Discussion: cách chuẩn bị workshop Robotics";
const BODY = "Mình muốn hỏi mọi người cách chia công việc chuẩn bị workshop sao cho hiệu quả.";
const REPLY = "Nên chia thành nhóm nội dung, hậu cần và truyền thông.";
const db = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u",
});

async function login(page: Page, code: string) {
  await page.goto("/login");
  await page.fill('input[name="school_member_code"]', code);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

async function cleanup() {
  const threads = await db.query<{ id: string }>(`SELECT id FROM "Thread" WHERE title=$1`, [TITLE]);
  const threadIds = threads.rows.map((row) => row.id);
  if (!threadIds.length) return;
  const posts = await db.query<{ id: string }>(
    `SELECT id FROM "Post" WHERE "threadId"=ANY($1::text[])`,
    [threadIds],
  );
  const postIds = posts.rows.map((row) => row.id);
  if (postIds.length) {
    const reports = await db.query<{ caseId: string | null }>(
      `SELECT "caseId" FROM "Report" WHERE "postId"=ANY($1::text[])`,
      [postIds],
    );
    const caseIds = reports.rows.map((row) => row.caseId).filter(Boolean) as string[];
    if (caseIds.length)
      await db.query(`DELETE FROM "ModerationActionRow" WHERE "caseId"=ANY($1::text[])`, [caseIds]);
    await db.query(`DELETE FROM "Report" WHERE "postId"=ANY($1::text[])`, [postIds]);
    if (caseIds.length)
      await db.query(`DELETE FROM "ModerationCase" WHERE id=ANY($1::text[])`, [caseIds]);
    await db.query(`DELETE FROM "Reaction" WHERE "postId"=ANY($1::text[])`, [postIds]);
    await db.query(`DELETE FROM "Post" WHERE id=ANY($1::text[])`, [postIds]);
  }
  await db.query(`DELETE FROM "Thread" WHERE id=ANY($1::text[])`, [threadIds]);
  await db.query(
    `DELETE FROM "AuditEvent" WHERE action IN ('DISCUSSION_THREAD_CREATE','FORUM_MODERATE') AND "entityType" IN ('Thread','Post')`,
  );
}

test.describe("Discussion Hub real workflow", () => {
  test.beforeEach(cleanup);
  test.afterAll(async () => {
    await cleanup();
    await db.end();
  });

  test("student creates thread, another student replies/reacts/reports, admin moderates", async ({
    page,
  }) => {
    await login(page, "HS000002");
    await page.goto("/discussion");
    await page.getByRole("link", { name: "Diễn đàn trường" }).first().click();
    await page.locator("#thread-title").fill(TITLE);
    await page.locator("#thread-body").fill(BODY);
    await page.getByRole("button", { name: "Đăng chủ đề" }).click();
    await page.waitForURL(/\/discussion\/threads\//);
    await expect(page.getByText(BODY)).toBeVisible();

    await page.context().clearCookies();
    await login(page, "HS000003");
    await page.goto("/discussion");
    await page.getByRole("link", { name: "Diễn đàn trường" }).first().click();
    await page.getByRole("link", { name: TITLE }).first().click();
    const original = page.getByTestId("discussion-post").first();
    await original.getByRole("button", { name: /Helpful/ }).click();
    await expect(original.getByRole("button", { name: /Helpful · 1/ })).toBeVisible();
    await page.locator(`textarea[id^="reply-"]`).fill(REPLY);
    await page.getByRole("button", { name: "Gửi phản hồi" }).click();
    await expect(page.getByText(REPLY)).toBeVisible();
    await original.getByText("Báo cáo").click();
    await original.getByLabel("Lý do báo cáo").selectOption("misinformation");
    await original.getByRole("button", { name: "Gửi báo cáo" }).click();

    await page.context().clearCookies();
    await login(page, "AD000001");
    await page.goto("/admin/moderation");
    const report = page.getByTestId("moderation-report").filter({ hasText: TITLE }).first();
    await expect(report).toBeVisible();
    await report.getByLabel("Hành động").selectOption("HIDE_POST");
    await report
      .getByLabel("Lý do (bắt buộc)")
      .fill("Nội dung được ẩn để xác minh thông tin theo báo cáo của học sinh.");
    await report.getByRole("button", { name: "Ghi quyết định" }).click();
    await expect(report.getByText(/Quyết định gần nhất: HIDE_POST/)).toBeVisible();

    await page.goto("/discussion");
    await page.getByRole("link", { name: "Diễn đàn trường" }).first().click();
    await page.getByRole("link", { name: TITLE }).first().click();
    await expect(page.getByText(BODY)).toHaveCount(0);
    await expect(page.getByText(REPLY)).toBeVisible();
  });
});
