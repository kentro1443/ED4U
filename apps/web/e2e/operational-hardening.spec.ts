import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const PASSWORD = "TempPass1!";
const EVENT_TITLE = "E2E School Event — Enterprise QA";
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

async function cleanupEvent() {
  await db.query(`DELETE FROM "SchoolEvent" WHERE title=$1`, [EVENT_TITLE]);
  await db.query(
    `DELETE FROM "AuditEvent" WHERE "entityType"='SchoolEvent' AND ("afterJson"->>'title'=$1 OR "beforeJson"->>'title'=$1)`,
    [EVENT_TITLE],
  );
}

test.afterAll(async () => {
  await cleanupEvent();
  await db.end();
});

test("liveness and readiness endpoints are cache-safe", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect((await live.json()).status).toBe("ok");
  expect(live.headers()["cache-control"]).toContain("no-store");

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect((await ready.json()).status).toBe("ready");
  expect(ready.headers()["cache-control"]).toContain("no-store");
});

test("baseline security headers are present", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

test("school admin creates a scoped event and students see it in the unified calendar", async ({
  page,
}) => {
  await cleanupEvent();
  await login(page, "AD000001");
  await page.goto("/events");
  await page.getByLabel("Tên sự kiện").fill(EVENT_TITLE);
  await page.getByLabel("Bắt đầu").fill("2026-08-19T14:00");
  await page.getByLabel("Kết thúc").fill("2026-08-19T15:30");
  await page.getByLabel("Hiển thị").selectOption("SCHOOL");
  await page.getByRole("button", { name: "Tạo sự kiện" }).click();
  await expect(page.getByText(EVENT_TITLE)).toBeVisible();

  await page.context().clearCookies();
  await login(page, "HS000002");
  await page.goto("/calendar?view=day&date=2026-08-19");
  await expect(page.getByText(EVENT_TITLE)).toBeVisible();

  await page.context().clearCookies();
  await login(page, "AD000001");
  await page.goto("/events");
  const card = page.locator("div.rounded-xl").filter({ hasText: EVENT_TITLE }).first();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Xóa" }).click();
  await expect(page.getByText(EVENT_TITLE)).toHaveCount(0);
});

test("room schedule exposes hard occupancy and soft-hold semantics", async ({ page }) => {
  await login(page, "HS000002");
  await page.goto("/rooms/schedule?date=2026-08-17");
  await expect(page.getByRole("heading", { name: "Lịch sử dụng phòng" })).toBeVisible();
  await expect(page.getByText("TKB = hard")).toBeVisible();
  await expect(page.getByText("Booking xác nhận = hard")).toBeVisible();
  await expect(page.getByText("Bảo trì = hard")).toBeVisible();
  await expect(page.getByText("Soft hold = risk only")).toBeVisible();
});
