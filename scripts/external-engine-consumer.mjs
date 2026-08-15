/**
 * Fresh consumer: import shipped packages and call ranking/planning.
 * Proves engines work outside their own test folders and do not open Prisma.
 */
import { createRequire } from "node:module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("tsx/esm", pathToFileURL("./"));

const { matchMentors } = await import("@ed4u/mentor-engine");
const { planRooms } = await import("@ed4u/facility-engine");

const require = createRequire(import.meta.url);
const mentors = require("../packages/mentor-engine/data/mentors.mock.json");
const requests = require("../packages/mentor-engine/data/requests.mock.json");

const request = requests[0];
const result = matchMentors({ request, mentors, topK: 3 });
if (!result || (!result.recommendations && !result.rejected)) {
  console.error("mentor engine returned unexpected shape", result);
  process.exit(1);
}
console.log("mentor recommendations", result.recommendations?.length ?? 0);

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

const mentorSrc = require("node:fs").readFileSync(
  new URL("../packages/mentor-engine/src/engine.ts", import.meta.url),
  "utf8",
);
const facilitySrc = require("node:fs").readFileSync(
  new URL("../packages/facility-engine/src/engine.ts", import.meta.url),
  "utf8",
);
if (/PrismaClient|from ['\"]@prisma/.test(mentorSrc + facilitySrc)) {
  console.error("engine opened Prisma");
  process.exit(1);
}
console.log("engines do not import Prisma");
