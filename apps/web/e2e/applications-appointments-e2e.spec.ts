import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { rm } from "node:fs/promises";
import path from "node:path";

const PASSWORD = "TempPass1!";
const APPLICATION_TEXT = "E2E_APPLICATION: Em muốn nhờ cô Lan hỗ trợ kế hoạch cải thiện điểm.";
const APPOINTMENT_TITLE = "E2E_APPOINTMENT: Trao đổi kế hoạch học Toán";
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
  const appRows = await db.query<{ id: string; fileId: string; storageKey: string }>(
    `SELECT a.id, v."fileId", f."storageKey"
     FROM "Application" a
     LEFT JOIN "ApplicationSubmissionVersion" v ON v."applicationId"=a.id
     LEFT JOIN "StoredFile" f ON f.id=v."fileId"
     WHERE a."rawRequestText"=$1`,
    [APPLICATION_TEXT],
  );
  const appIds = [...new Set(appRows.rows.map((row) => row.id))];
  const fileIds = appRows.rows.map((row) => row.fileId).filter(Boolean);
  if (appIds.length) {
    await db.query(
      `DELETE FROM "Notification" WHERE "entityType"='Application' AND "entityId"=ANY($1::text[])`,
      [appIds],
    );
    await db.query(
      `DELETE FROM "AuditEvent" WHERE "entityType"='Application' AND "entityId"=ANY($1::text[])`,
      [appIds],
    );
    await db.query(
      `DELETE FROM "ApplicationSubmissionVersion" WHERE "applicationId"=ANY($1::text[])`,
      [appIds],
    );
    await db.query(`DELETE FROM "Application" WHERE id=ANY($1::text[])`, [appIds]);
  }
  if (fileIds.length)
    await db.query(`DELETE FROM "StoredFile" WHERE id=ANY($1::text[])`, [fileIds]);
  for (const row of appRows.rows) {
    if (row.storageKey) {
      await rm(path.resolve(process.cwd(), "..", "..", "storage", row.storageKey), {
        force: true,
      }).catch(() => undefined);
    }
  }

  const appointments = await db.query<{ id: string }>(
    `SELECT id FROM "Appointment" WHERE title=$1`,
    [APPOINTMENT_TITLE],
  );
  const appointmentIds = appointments.rows.map((row) => row.id);
  if (appointmentIds.length) {
    const conversations = await db.query<{ id: string }>(
      `SELECT id FROM "Conversation" WHERE "appointmentId"=ANY($1::text[])`,
      [appointmentIds],
    );
    const conversationIds = conversations.rows.map((row) => row.id);
    if (conversationIds.length)
      await db.query(`DELETE FROM "Message" WHERE "conversationId"=ANY($1::text[])`, [
        conversationIds,
      ]);
    await db.query(`DELETE FROM "Conversation" WHERE "appointmentId"=ANY($1::text[])`, [
      appointmentIds,
    ]);
    await db.query(
      `DELETE FROM "Notification" WHERE "entityType"='Appointment' AND "entityId"=ANY($1::text[])`,
      [appointmentIds],
    );
    await db.query(
      `DELETE FROM "AuditEvent" WHERE "entityType"='Appointment' AND "entityId"=ANY($1::text[])`,
      [appointmentIds],
    );
    await db.query(`DELETE FROM "Appointment" WHERE id=ANY($1::text[])`, [appointmentIds]);
  }
}

test.describe("Applications and teacher appointments", () => {
  test.beforeEach(cleanup);
  test.afterAll(async () => {
    await cleanup();
    await db.end();
  });

  test("student downloads/uploads a versioned PDF and teacher reviews it", async ({ page }) => {
    await login(page, "HS000002");
    await page.goto("/applications");
    await expect(page.getByRole("link", { name: "Tải mẫu PDF" })).toHaveAttribute(
      "href",
      "/templates/ed4u-student-application-template.pdf",
    );
    await page.locator("#application-need").fill(APPLICATION_TEXT);
    await page.getByRole("button", { name: "Gợi ý giáo viên phụ trách" }).click();
    await page.getByRole("button", { name: /Cô Lan/ }).click();
    await page
      .locator("#application-file")
      .setInputFiles("public/templates/ed4u-student-application-template.pdf");
    await page.getByRole("button", { name: "Nộp đơn & PDF phiên bản 1" }).click();
    await expect(page.getByText(/Đã nộp đơn và chuyển tới Cô Lan/)).toBeVisible();
    await expect(page.getByText("Đã nộp").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /v1 ·/ })).toBeVisible();

    await page.context().clearCookies();
    await login(page, "GV000001");
    await page.goto("/applications");
    await expect(page.getByText(APPLICATION_TEXT)).toBeVisible();
    const applicationCard = page
      .getByTestId("application-card")
      .filter({ hasText: APPLICATION_TEXT });
    await applicationCard.getByRole("button", { name: "Bắt đầu review" }).click();
    await expect(applicationCard.getByText("Đang review")).toBeVisible();
    await applicationCard.getByRole("button", { name: "Duyệt", exact: true }).click();
    await expect(applicationCard.getByText("Đã duyệt")).toBeVisible();
  });

  test("student requests a teacher meeting, teacher accepts, then chat opens", async ({ page }) => {
    await login(page, "HS000002");
    await page.goto("/appointments");
    await page.locator("#appointment-need").fill("Em muốn gặp cô Lan để trao đổi kế hoạch học tập");
    await page.getByRole("button", { name: "Gợi ý giáo viên" }).click();
    await page.getByRole("button", { name: /Cô Lan/ }).click();
    await page.locator("#appointment-title").fill(APPOINTMENT_TITLE);
    await page.locator("#appointment-date").fill("2026-08-18");
    await page.locator("#appointment-start").fill("15:00");
    await page.locator("#appointment-end").fill("15:30");
    await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
    await expect(page.getByText(/Đã gửi yêu cầu lịch hẹn tới Cô Lan/)).toBeVisible();

    await page.context().clearCookies();
    await login(page, "GV000001");
    await page.goto("/appointments");
    const appointment = page.getByTestId("appointment-card").filter({ hasText: APPOINTMENT_TITLE });
    await expect(appointment).toBeVisible();
    await appointment.getByRole("button", { name: "Chấp nhận" }).click();
    await expect(appointment.getByText("Đã chấp nhận")).toBeVisible();
    await expect(appointment.getByText("Trao đổi trong lịch hẹn")).toBeVisible();
    await appointment.getByLabel("Tin nhắn lịch hẹn").fill("Hẹn em vào chiều thứ Ba nhé.");
    await appointment.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(appointment.getByText("Hẹn em vào chiều thứ Ba nhé.")).toBeVisible();
  });
});
