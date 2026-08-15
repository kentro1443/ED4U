import fs from "node:fs";

import {
  resolveStudentRequest,
  applyHardConstraints,
  topKRecommendations,
} from "./src/index.ts";

const mentors = JSON.parse(
  fs.readFileSync("./data/mentors.mock.json", "utf8"),
);

/*
 * EDIT THIS PART.
 * Pretend you are a student.
 */
const rawRequest = {
  requestId: "MY-DEMO",

  goal: {
    domain: "ielts",
    currentScore: 6,
    targetScore: 7,
    focusSkills: ["writing"],
  },

  hardConstraints: {
    verifiedOnly: true,
    maxPricePerHour: "350k",
  },

  availability: [
    "thứ 3 19:00",
    "thứ 5 19:00",
  ],

  softPreferences: {
    teachingStyles: ["kiên nhẫn"],
  },

  additionalPreferences: [
    "mentor vui tính",
  ],
};

/* STEP 1 — understand request */

const resolved = resolveStudentRequest(rawRequest);

console.log("\n================ REQUEST RESOLUTION ================\n");
console.log(JSON.stringify(resolved.resolution, null, 2));

if (!resolved.request) {
  console.log("\nEngine could not build an executable request.");
  process.exit(0);
}

/* STEP 2 — hard filter */

const filtered = applyHardConstraints(
  resolved.request,
  mentors,
);

console.log("\n================ FILTERING ================\n");

console.log(
  `${filtered.diagnostics.candidateCount} candidates → ` +
  `${filtered.diagnostics.eligibleCount} eligible`,
);

console.log(
  JSON.stringify(
    filtered.diagnostics.filteredOut,
    null,
    2,
  ),
);

if (filtered.status === "NO_FEASIBLE_MATCH") {
  console.log("\nNO FEASIBLE MATCH.");
  process.exit(0);
}

/* STEP 3 — rank + explain */

const recommendations = topKRecommendations(
  resolved.request,
  filtered.eligible,
  { topK: 5 },
);

const mentorById = new Map(
  mentors.map((mentor: any) => [
    mentor.id,
    mentor,
  ]),
);

/* STEP 4 — pretty-print */

console.log("\n================ TOP 5 ================\n");

for (const recommendation of recommendations) {
  const mentor = mentorById.get(
    recommendation.mentorId,
  ) as any;

  console.log(
    `#${recommendation.rank} ${mentor?.name}`,
  );

  console.log(
    `ID: ${recommendation.mentorId}`,
  );

  console.log(
    `Match score: ${recommendation.matchScore}`,
  );

  console.log(
    `Data coverage: ${(
      recommendation.dataCoverage * 100
    ).toFixed(1)}%`,
  );

  console.log("\nWhy this mentor?");

  for (const reason of recommendation.reasons) {
    console.log(`  ✓ ${reason}`);
  }

  if (recommendation.tradeoffs.length > 0) {
    console.log("\nTradeoffs:");

    for (const tradeoff of recommendation.tradeoffs) {
      console.log(`  ⚠ ${tradeoff}`);
    }
  }

  console.log(
    "\nScore breakdown:",
    recommendation.scoreBreakdown,
  );

  console.log("\n---------------------------------------\n");
}
