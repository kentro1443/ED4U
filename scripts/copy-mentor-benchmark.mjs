import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "packages/mentor-engine/data/benchmark/report.json");
const destDir = join(root, "benchmark/reports");
mkdirSync(destDir, { recursive: true });
if (existsSync(src)) {
  copyFileSync(src, join(destDir, "mentor-latest.json"));
}
