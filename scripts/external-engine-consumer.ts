import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchMentors } from "../packages/mentor-engine/src/index.ts";
import { planRooms } from "../packages/facility-engine/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mentors = JSON.parse(
  readFileSync(join(root, "packages/mentor-engine/data/mentors.mock.json"), "utf8"),
);
const requests = JSON.parse(
  readFileSync(join(root, "packages/mentor-engine/data/requests.mock.json"), "utf8"),
);

const result = matchMentors({ request: requests[0], mentors, topK: 3 });
if (!result.recommendations) {
  console.error("mentor engine returned unexpected shape");
  process.exit(1);
}
console.log("mentor recommendations", result.recommendations.length);

const plan = planRooms(
  {
    dateForDay: "2026-08-21",
    hours: { startMinutes: 420, endMinutes: 1200, weekdaysOnly: true },
    rooms: [
      {
        id: "r1",
        code: "LAB-01",
        name: "Lab",
        roomType: "COMPUTER_LAB",
        building: "STEM",
        floor: "1",
        capacity: 100,
        status: "ACTIVE",
        features: { PROJECTOR: true },
      },
    ],
    occupancy: [],
    pendingHolds: [],
  },
  {
    requestId: "c1",
    attendees: 20,
    requiredFeatures: ["PROJECTOR"],
    day: "FRI",
    timeWindow: { start: "13:00", end: "15:00", flexible: true },
  },
);
if (plan.kind !== "PLANS" && plan.kind !== "NO_SOLUTION") {
  console.error("facility engine unexpected", plan);
  process.exit(1);
}
console.log(
  "facility",
  plan.kind,
  plan.kind === "PLANS" ? plan.plans.length : plan.blockers.length,
);

const mentorSrc = readFileSync(join(root, "packages/mentor-engine/src/engine.ts"), "utf8");
const facilitySrc = readFileSync(join(root, "packages/facility-engine/src/engine.ts"), "utf8");
if (/PrismaClient|from ['"]@prisma/.test(mentorSrc + facilitySrc)) {
  console.error("engine opened Prisma");
  process.exit(1);
}
console.log("engines do not import Prisma");
