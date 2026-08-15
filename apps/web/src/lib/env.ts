export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-32b",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DEMO_SKIP_PASSWORD_CHANGE: process.env.DEMO_SKIP_PASSWORD_CHANGE === "true",
};
