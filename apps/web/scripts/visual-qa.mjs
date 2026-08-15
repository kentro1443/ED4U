import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DEMO_PASSWORD = "TempPass1!";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUTPUT_DIR = join(process.cwd(), "apps/web/test-results/visual-qa");

mkdirSync(OUTPUT_DIR, { recursive: true });

async function runVisualQA() {
  const browser = await chromium.launch();

  console.log(`Starting Visual QA pass against ${BASE_URL}...`);

  // 1. Desktop 1440px
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();

  // Login page
  await desktopPage.goto(`${BASE_URL}/login`);
  await desktopPage.screenshot({ path: join(OUTPUT_DIR, "desktop-login.png") });
  console.log("Captured: desktop-login.png");

  // Login as student
  await desktopPage.fill('input[name="school_member_code"]', "HS000001");
  await desktopPage.fill('input[name="password"]', DEMO_PASSWORD);
  await desktopPage.click('button[type="submit"]');
  await desktopPage.waitForURL(`${BASE_URL}/dashboard`);
  await desktopPage.screenshot({ path: join(OUTPUT_DIR, "desktop-dashboard.png") });
  console.log("Captured: desktop-dashboard.png");

  // Mentor page
  await desktopPage.goto(`${BASE_URL}/mentor`);
  await desktopPage.screenshot({ path: join(OUTPUT_DIR, "desktop-mentor.png") });
  console.log("Captured: desktop-mentor.png");

  // Calendar page
  await desktopPage.goto(`${BASE_URL}/calendar`);
  await desktopPage.screenshot({ path: join(OUTPUT_DIR, "desktop-calendar.png") });
  console.log("Captured: desktop-calendar.png");

  // Rooms page
  await desktopPage.goto(`${BASE_URL}/rooms`);
  await desktopPage.screenshot({ path: join(OUTPUT_DIR, "desktop-rooms.png") });
  console.log("Captured: desktop-rooms.png");

  // Admin Members (switch user to IT admin)
  const adminPage = await desktopContext.newPage();
  await adminPage.goto(`${BASE_URL}/login`);
  await adminPage.fill('input[name="school_member_code"]', "IT000001");
  await adminPage.fill('input[name="password"]', DEMO_PASSWORD);
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForURL(`${BASE_URL}/dashboard`);
  await adminPage.goto(`${BASE_URL}/admin/members`);
  await adminPage.screenshot({ path: join(OUTPUT_DIR, "desktop-admin-members.png") });
  console.log("Captured: desktop-admin-members.png");

  // 2. Mobile 390px
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();

  // Login as student
  await mobilePage.goto(`${BASE_URL}/login`);
  await mobilePage.fill('input[name="school_member_code"]', "HS000001");
  await mobilePage.fill('input[name="password"]', DEMO_PASSWORD);
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForURL(`${BASE_URL}/dashboard`);
  await mobilePage.screenshot({ path: join(OUTPUT_DIR, "mobile-dashboard.png") });
  console.log("Captured: mobile-dashboard.png");

  // Mobile Drawer
  await mobilePage.getByRole("button", { name: "Mở menu điều hướng" }).click();
  await mobilePage.getByRole("dialog").waitFor();
  await mobilePage.screenshot({ path: join(OUTPUT_DIR, "mobile-drawer.png") });
  console.log("Captured: mobile-drawer.png");
  await mobilePage.keyboard.press("Escape");

  // Mobile Mentor
  await mobilePage.goto(`${BASE_URL}/mentor`);
  await mobilePage.screenshot({ path: join(OUTPUT_DIR, "mobile-mentor.png") });
  console.log("Captured: mobile-mentor.png");

  // Mobile Calendar
  await mobilePage.goto(`${BASE_URL}/calendar`);
  await mobilePage.screenshot({ path: join(OUTPUT_DIR, "mobile-calendar.png") });
  console.log("Captured: mobile-calendar.png");

  // Mobile Rooms
  await mobilePage.goto(`${BASE_URL}/rooms`);
  await mobilePage.screenshot({ path: join(OUTPUT_DIR, "mobile-rooms.png") });
  console.log("Captured: mobile-rooms.png");

  await browser.close();
  console.log("Visual QA pass complete!");
}

runVisualQA().catch((err) => {
  console.error("Visual QA failed:", err);
  process.exit(1);
});
