import { spawnSync } from "node:child_process";

const steps = [
  ["Format", "npm", ["run", "format"]],
  ["Lint", "npm", ["run", "lint"]],
  ["Typecheck", "npm", ["run", "typecheck"]],
  ["Prisma validate", "npm", ["run", "db:validate"]],
  ["Unit tests", "npm", ["run", "test:unit"]],
  ["Integration tests", "npm", ["run", "test:integration"]],
  // The full benchmarks run in under a second each, and the smoke variants
  // overwrite the committed report with a truncated workload — which made
  // `verify` fail the second time it was run. Always run the full sets.
  ["Mentor benchmark", "npm", ["run", "benchmark:mentor"]],
  ["Facility benchmark", "npm", ["run", "benchmark:facility"]],
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
