import { spawnSync } from "node:child_process";

const steps = [
  ["Format", "npm", ["run", "format"]],
  ["Lint", "npm", ["run", "lint"]],
  ["Typecheck", "npm", ["run", "typecheck"]],
  ["Prisma validate", "npm", ["run", "db:validate"]],
  ["Unit tests", "npm", ["run", "test:unit"]],
  ["Integration tests", "npm", ["run", "test:integration"]],
  ["Mentor benchmark smoke", "npm", ["run", "benchmark:mentor:smoke"]],
  ["Facility benchmark smoke", "npm", ["run", "benchmark:facility:smoke"]],
  ["Production build", "npm", ["run", "build"]],
  ["Playwright E2E", "npm", ["run", "test:e2e", "-w", "@ed4u/web"]],
];

for (const [label, cmd, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false, cwd: process.cwd() });
  if (result.status !== 0) {
    console.error(`\n${label} failed with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n=== Verification complete: all checks passed ===");
