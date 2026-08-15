import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Integration tests need DATABASE_URL from the repo root .env.
loadEnv({ path: path.resolve(__dirname, "../../.env"), quiet: true });

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
