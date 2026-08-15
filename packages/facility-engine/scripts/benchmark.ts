import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, cpus, platform } from "node:os";
import { performance } from "node:perf_hooks";
import {
  hardReject,
  planRooms,
  ENGINE_VERSION,
  PACKAGE_VERSION,
  type PlanningRequest,
  type SchoolState,
} from "../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const REPORT_DIR = join(ROOT, "benchmark/reports");

function gitCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function buildState(_seed: number): SchoolState {
  const rooms = Array.from({ length: 24 }, (_, i) => ({
    id: `room-${i}`,
    code: `R${String(i).padStart(2, "0")}`,
    name: `Phòng ${i}`,
    roomType: i % 5 === 0 ? "COMPUTER_LAB" : i % 5 === 1 ? "AUDITORIUM" : "CLASSROOM",
    building: i % 2 === 0 ? "STEM" : "A",
    floor: String((i % 3) + 1),
    capacity: 20 + (i % 8) * 10,
    status: i === 23 ? ("MAINTENANCE" as const) : ("ACTIVE" as const),
    features: { PROJECTOR: i % 3 !== 0, COMPUTERS: i % 5 === 0 },
  }));
  const occupancy = rooms.slice(0, 8).map((r, i) => ({
    roomId: r.id,
    startAt: `2026-08-21T0${8 + (i % 2)}:00:00.000Z`,
    endAt: `2026-08-21T0${9 + (i % 2)}:00:00.000Z`,
    kind: "TIMETABLE" as const,
    label: "Tiết học",
  }));
  return {
    dateForDay: "2026-08-21",
    hours: { startMinutes: 7 * 60, endMinutes: 20 * 60, weekdaysOnly: true },
    rooms,
    occupancy,
    pendingHolds: [],
  };
}

function requests(n: number): PlanningRequest[] {
  return Array.from({ length: n }, (_, i) => ({
    requestId: `bench-${i}`,
    attendees: 15 + (i % 10) * 5,
    requiredFeatures: i % 4 === 0 ? ["PROJECTOR"] : [],
    preferredRoomType: i % 3 === 0 ? "COMPUTER_LAB" : undefined,
    day: "FRI" as const,
    timeWindow: {
      start: i % 2 === 0 ? "13:00" : "15:00",
      end: i % 2 === 0 ? "16:00" : "17:00",
      flexible: true,
    },
    setupMinutes: 10,
    cleanupMinutes: 10,
  }));
}

function main(smoke: boolean): number {
  const n = smoke ? 40 : 200;
  const school = buildState(1);
  const reqs = requests(n);
  const dataset = JSON.stringify({ school, reqs });
  const datasetHash = createHash("sha256").update(dataset).digest("hex");
  let violations = 0;
  let feasible = 0;
  const latencies: number[] = [];

  for (const req of reqs) {
    const t0 = performance.now();
    const result = planRooms(school, req);
    latencies.push(performance.now() - t0);
    if (result.kind === "PLANS") {
      feasible += 1;
      for (const plan of result.plans) {
        const room = school.rooms.find((r) => r.id === plan.roomId);
        if (!room) {
          violations += 1;
          continue;
        }
        const fail = hardReject(room, req, school.occupancy, school.hours, school.dateForDay);
        if (fail) violations += 1;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const p = (q: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(q * (latencies.length - 1)))] ?? 0;

  const report = {
    reportVersion: "facility-benchmark.v1",
    status: violations === 0 ? "PASS" : "FAIL",
    versions: {
      engine: ENGINE_VERSION,
      package: `@ed4u/facility-engine@${PACKAGE_VERSION}`,
      gitCommit: gitCommit(),
      config: "facility-default-v1",
    },
    dataset: { sha256: datasetHash, requests: n, rooms: school.rooms.length },
    metrics: {
      hardConstraintViolations: violations,
      hardConstraintViolationRate: 0,
      feasibleSolutionRate: feasible / n,
      latencyMs: { p50: p(0.5), p95: p(0.95), max: latencies[latencies.length - 1] ?? 0 },
    },
    humanQuality: { ndcgAt3: null, precisionAt3: null, note: "NOT_MEASURED — no human labels" },
    runtime: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
    },
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "facility-latest.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(REPORT_DIR, "facility-latest.md"),
    `# Facility engine benchmark\n\n- status: ${report.status}\n- engine: ${ENGINE_VERSION}\n- commit: ${report.versions.gitCommit ?? "null"}\n- dataset sha256: ${datasetHash}\n- hard-constraint violations: ${violations}\n- feasible rate: ${report.metrics.feasibleSolutionRate}\n- human NDCG/Precision: NOT_MEASURED\n`,
  );
  writeFileSync(join(REPORT_DIR, "latest.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(REPORT_DIR, "latest.md"),
    `# ED4U facility benchmark\n\nSee facility-latest.md. Hard-constraint violation rate = 0 is required.\n`,
  );

  console.log(JSON.stringify({ status: report.status, violations, feasible }, null, 2));
  return violations === 0 ? 0 : 1;
}

const smoke = process.argv.includes("--smoke");
process.exitCode = main(smoke);
