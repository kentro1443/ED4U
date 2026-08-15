import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const PASSWORD = "TempPass1!";
const PURPOSE = "80 người, chiều thứ Hai, cần máy chiếu, ưu tiên hội trường";
const cleanupDb = new Pool({
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
  const membership = await cleanupDb.query<{ userId: string; tenantId: string }>(
    `SELECT "userId", "tenantId" FROM "SchoolMembership" WHERE "schoolMemberCode"=$1 LIMIT 1`,
    ["HS000002"],
  );
  const row = membership.rows[0];
  if (!row) return;
  const ids = await cleanupDb.query<{ id: string }>(
    `SELECT "id" FROM "RoomRequest" WHERE "tenantId"=$1 AND "requestedBy"=$2 AND "purpose"=$3`,
    [row.tenantId, row.userId, PURPOSE],
  );
  const requestIds = ids.rows.map((entry) => entry.id);
  if (!requestIds.length) return;
  await cleanupDb.query(`DELETE FROM "RoomBooking" WHERE "requestId" = ANY($1::text[])`, [
    requestIds,
  ]);
  await cleanupDb.query(
    `DELETE FROM "Notification" WHERE "entityType"='RoomRequest' AND "entityId" = ANY($1::text[])`,
    [requestIds],
  );
  await cleanupDb.query(
    `DELETE FROM "AuditEvent" WHERE "entityType"='RoomRequest' AND "entityId" = ANY($1::text[])`,
    [requestIds],
  );
  await cleanupDb.query(`DELETE FROM "RoomRequest" WHERE "id" = ANY($1::text[])`, [requestIds]);
}

test.describe("Facility Engine live E2E", () => {
  test.beforeEach(cleanup);
  test.afterAll(async () => {
    await cleanup();
    await cleanupDb.end();
  });

  test("student plans against live occupancy, submits a soft hold, and admin confirms it", async ({
    page,
  }) => {
    await login(page, "HS000002");
    await page.goto("/rooms");
    await page.locator("#facility-prompt").fill(PURPOSE);
    await page.getByRole("button", { name: "Phân tích yêu cầu" }).click();
    await expect(page.getByLabel("Số người")).toHaveValue("80");
    await expect(page.getByLabel("Bắt đầu")).toHaveValue("13:00");
    await expect(page.getByLabel("Kết thúc")).toHaveValue("17:00");

    await page.getByRole("button", { name: "Tìm phương án khả thi" }).click();
    await expect(page.getByRole("heading", { name: "Kết quả lập kế hoạch" })).toBeVisible();
    await expect(page.getByText(/khoảng bận cứng/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "R04" })).toHaveCount(0);
    await expect(page.getByText(/soft hold/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Gửi yêu cầu phòng này" }).first().click();
    await expect(page.getByText(/Yêu cầu phòng đã được gửi tới School Admin/)).toBeVisible();
    await expect(page.getByText("Chờ duyệt").first()).toBeVisible();

    await page.context().clearCookies();
    await login(page, "AD000001");
    await page.goto("/admin/approvals");
    await expect(page.getByText(`“${PURPOSE}”`)).toBeVisible();
    await page.getByRole("button", { name: "Duyệt & khóa phòng" }).first().click();
    await expect(page.getByText(`“${PURPOSE}”`)).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, "HS000002");
    await page.goto("/rooms");
    await expect(page.getByText("Đã duyệt").first()).toBeVisible();
    await expect(page.getByText("Đã có booking được xác nhận.").first()).toBeVisible();
  });
});
