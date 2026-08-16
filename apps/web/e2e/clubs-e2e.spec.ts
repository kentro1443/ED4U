import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const PASSWORD = "TempPass1!";
const CLUB_NAME = "CLB E2E Trí tuệ dữ liệu";
const FINANCE_DESCRIPTION = "E2E club finance expense";
const EVENT_TITLE = "E2E Workshop Robotics";
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

/** The seeded display name behind a school member code. */
async function memberFullName(code: string): Promise<string> {
  const result = await db.query<{ fullName: string }>(
    `SELECT u."fullName" FROM "User" u
       JOIN "SchoolMembership" m ON m."userId" = u.id
      WHERE m."schoolMemberCode" = $1 LIMIT 1`,
    [code],
  );
  const name = result.rows[0]?.fullName;
  if (!name) throw new Error(`No seeded member for code ${code}`);
  return name;
}

async function cleanup() {
  const eventRows = await db.query<{ id: string }>(`SELECT id FROM "ClubEvent" WHERE title=$1`, [
    EVENT_TITLE,
  ]);
  if (eventRows.rows.length)
    await db.query(`DELETE FROM "ClubEvent" WHERE id=ANY($1::text[])`, [
      eventRows.rows.map((row) => row.id),
    ]);
  await db.query(`DELETE FROM "FinanceEntry" WHERE description=$1`, [FINANCE_DESCRIPTION]);

  const robotics = await db.query<{ id: string }>(
    `SELECT id FROM "Club" WHERE name='CLB Robotics' LIMIT 1`,
  );
  const student = await db.query<{ userId: string }>(
    `SELECT "userId" FROM "SchoolMembership" WHERE "schoolMemberCode"='HS000002' LIMIT 1`,
  );
  if (robotics.rows[0] && student.rows[0]) {
    await db.query(`DELETE FROM "ClubMembership" WHERE "clubId"=$1 AND "userId"=$2`, [
      robotics.rows[0].id,
      student.rows[0].userId,
    ]);
  }

  const club = await db.query<{ id: string }>(`SELECT id FROM "Club" WHERE name=$1`, [CLUB_NAME]);
  if (club.rows.length) {
    const ids = club.rows.map((row) => row.id);
    await db.query(`DELETE FROM "ClubAdvisor" WHERE "clubId"=ANY($1::text[])`, [ids]);
    await db.query(`DELETE FROM "ClubMembership" WHERE "clubId"=ANY($1::text[])`, [ids]);
    await db.query(`DELETE FROM "ClubEvent" WHERE "clubId"=ANY($1::text[])`, [ids]);
    await db.query(`DELETE FROM "FinanceEntry" WHERE "clubId"=ANY($1::text[])`, [ids]);
    await db.query(`DELETE FROM "Club" WHERE id=ANY($1::text[])`, [ids]);
  }
  await db.query(
    `DELETE FROM "Notification" WHERE title IN ('Có đề xuất CLB mới','Đề xuất CLB đã được duyệt','Bạn đã được duyệt vào CLB')`,
  );
  await db.query(
    `DELETE FROM "AuditEvent" WHERE action IN ('CLUB_PROPOSE','CLUB_APPROVE') AND "entityType"='Club'`,
  );
}

test.describe("Club operating workflows", () => {
  test.beforeEach(cleanup);
  test.afterAll(async () => {
    await cleanup();
    await db.end();
  });

  test("student proposal is approved by School Admin, then student becomes President", async ({
    page,
  }) => {
    await login(page, "HS000002");
    await page.goto("/clubs");
    await page.locator("#club-name").fill(CLUB_NAME);
    await page
      .locator("#club-description")
      .fill(
        "CLB nghiên cứu dữ liệu, lập trình và tổ chức workshop kỹ thuật cho học sinh trong trường.",
      );
    await page.getByRole("button", { name: "Gửi đề xuất" }).click();
    await expect(page.getByText(CLUB_NAME)).toBeVisible();
    await expect(page.getByText("Đang đề xuất").last()).toBeVisible();

    await page.context().clearCookies();
    await login(page, "AD000001");
    await page.goto("/clubs");
    const proposedCard = page.getByTestId("club-card").filter({ hasText: CLUB_NAME });
    await expect(proposedCard).toBeVisible();
    await proposedCard.getByRole("button", { name: "Duyệt CLB" }).click();
    await expect(proposedCard.getByText("Hoạt động")).toBeVisible();

    await page.context().clearCookies();
    await login(page, "HS000002");
    await page.goto("/clubs");
    await page.getByRole("link", { name: CLUB_NAME }).click();
    await expect(page.getByText("PRESIDENT").first()).toBeVisible();
  });

  test("club president approves a member, records finance and proposes a room-backed event", async ({
    page,
  }) => {
    // Resolved from the database rather than hardcoded: the applicant is
    // identified by member code, and their display name is seed data that has
    // changed before and will change again.
    const applicantName = await memberFullName("HS000002");
    await login(page, "HS000002");
    await page.goto("/clubs");
    await page.getByRole("link", { name: "CLB Robotics" }).click();
    await page.getByRole("button", { name: "Xin tham gia CLB" }).click();
    await expect(page.getByText(/chờ duyệt/i).first()).toBeVisible();

    await page.context().clearCookies();
    await login(page, "HS000010");
    await page.goto("/clubs");
    await page.getByRole("link", { name: "CLB Robotics" }).click();
    const pendingMember = page
      .getByTestId("pending-club-member")
      .filter({ hasText: applicantName });
    await pendingMember.getByRole("button", { name: "Duyệt", exact: true }).click();
    await expect(pendingMember).toHaveCount(0);
    await expect(
      page.getByTestId("active-club-member").filter({ hasText: applicantName }),
    ).toContainText("MEMBER");

    await page.getByLabel("Loại bút toán").selectOption("EXPENSE");
    await page.getByLabel("Số tiền").fill("150000");
    await page.getByLabel("Danh mục").fill("Vật tư");
    await page.getByLabel("Mô tả").fill(FINANCE_DESCRIPTION);
    await page.getByRole("button", { name: "Ghi sổ (chờ duyệt)" }).click();
    const financeCard = page.getByTestId("finance-entry").filter({ hasText: FINANCE_DESCRIPTION });
    await expect(financeCard).toContainText("Đang chờ");
    await financeCard.getByRole("button", { name: "Duyệt bút toán" }).click();
    await expect(financeCard).toContainText("Đã duyệt");

    const eventForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="title"]') })
      .last();
    await eventForm.locator('input[name="title"]').fill(EVENT_TITLE);
    await eventForm.locator('input[name="startAt"]').fill("2026-08-20T18:00");
    await eventForm.locator('input[name="endAt"]').fill("2026-08-20T19:30");
    await eventForm.locator('input[name="roomRequired"]').check();
    await eventForm.getByRole("button", { name: "Tạo đề xuất sự kiện" }).click();
    const eventCard = page.getByTestId("club-event").filter({ hasText: EVENT_TITLE });
    await expect(eventCard).toBeVisible();
    await expect(
      eventCard.getByRole("link", { name: "Tìm phòng bằng Facility Engine" }),
    ).toBeVisible();
  });
});
