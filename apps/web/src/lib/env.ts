export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-32b",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DEMO_SKIP_PASSWORD_CHANGE: process.env.DEMO_SKIP_PASSWORD_CHANGE === "true",
  /**
   * DEMO-ONLY. When enabled, a mentor booking that cannot be completed is
   * presented to the student as "waitlisted, mentor notified" instead of an
   * error, and the mentor receives a real waitlist notification. No booking is
   * written and the audit trail still records the true failure — see
   * `lib/mentor/waitlist.ts`. Defaults to on for the demo; set
   * `DEMO_MENTOR_WAITLIST=false` to restore plain error reporting.
   */
  DEMO_MENTOR_WAITLIST: process.env.DEMO_MENTOR_WAITLIST !== "false",
};
