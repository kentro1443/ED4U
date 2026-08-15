/**
 * External-consumer smoke test.
 *
 * Everything else in this repository imports the engine from source. That
 * proves the code works; it does not prove the *package* works. A missing file
 * in `files`, a JSON asset that never got published, a type that only resolves
 * through a relative path — none of those show up until somebody installs the
 * tarball.
 *
 * So this script does what a real consumer does:
 *
 * 1. `npm pack` the package;
 * 2. create a throwaway project in a temp directory, outside this tree;
 * 3. install the tarball into it;
 * 4. write a strict TypeScript consumer that imports **only** the packed package;
 * 5. run `tsc --noEmit` with NodeNext + `skipLibCheck: false` to verify declarations;
 * 6. compile and run it under plain Node with no Next.js or bundler;
 * 7. independently audit every returned mentor against the hard constraints.
 *
 * ```bash
 * npm run verify:external
 * ```
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The consumer program, written into the temp project. */
const CONSUMER_SOURCE = `
// A consumer sees exactly this surface: the package name, nothing else.
import {
  matchMentors,
  validateMentors,
  validateStudentRequest,
  satisfiesHardConstraints,
  exampleMentorAdapter,
  ENGINE_VERSION,
  PACKAGE_VERSION,
  type Mentor,
  type StudentRequest,
  type MatchResponse,
  type MentorDataAdapter,
  type MockMentorRow,
  type SemanticParser,
  type ParserInvocationInput,
  type ParseResult,
} from "@ed4u/mentor-engine";

// Compile-time probes: these force the packed public .d.ts surface to be usable
// from a real external NodeNext TypeScript project.
const _mentorTypeProbe: Mentor | undefined = undefined;
const _requestTypeProbe: StudentRequest | undefined = undefined;
const _adapterTypeProbe: MentorDataAdapter<MockMentorRow> = exampleMentorAdapter;
const _parserTypeProbe: SemanticParser = {
  name: "external-type-probe",
  version: "1.0.0",
  parse(input: ParserInvocationInput): ParseResult {
    void input.signal;
    return { status: "EMPTY", candidate: {}, unhandled: [], notes: [] };
  },
};
void [_mentorTypeProbe, _requestTypeProbe, _adapterTypeProbe, _parserTypeProbe];

const failures: string[] = [];
const check = (label: string, condition: boolean): void => {
  if (!condition) failures.push(label);
};

/* --- Canonical mentors across all three domains ------------------------- */
const mentorRows = [
  {
    id: "M-IELTS", name: "IELTS Mentor", birthYear: 1998, verified: true,
    credentials: { ielts: { overall: 8, listening: 8, reading: 8, writing: 8, speaking: 8 }, sat: null, hsk: null },
    expertise: ["IELTS.WRITING"], availability: ["TUE_19_00"], pricePerHour: 300000,
    sessionsCompleted: 100, teachingExperienceMonths: 24, rating: 4.7, teachingStyles: ["PATIENT"],
  },
  {
    id: "M-SAT", name: "SAT Mentor", birthYear: 1996, verified: true,
    credentials: { ielts: null, sat: { total: 1520, math: 800, readingWriting: 720 }, hsk: null },
    expertise: ["SAT.MATH"], availability: ["THU_19_00"], pricePerHour: 400000,
  },
  {
    id: "M-HSK", name: "HSK Mentor", birthYear: 1994, verified: false,
    credentials: { ielts: null, sat: null, hsk: { level: 6 } },
    expertise: ["HSK.READING"], availability: ["SAT_09_00"], pricePerHour: 250000,
  },
];

const mentors = validateMentors(mentorRows);
check("mentors validate", mentors.ok);
if (!mentors.ok) {
  throw new Error("mentor validation failed: " + JSON.stringify(mentors.issues));
}

/* --- One request per domain --------------------------------------------- */
const scenarios = [
  { domain: "IELTS", focusSkills: ["IELTS.WRITING"], slot: "TUE_19_00", expect: "M-IELTS" },
  { domain: "SAT", focusSkills: ["SAT.MATH"], slot: "THU_19_00", expect: "M-SAT" },
  { domain: "HSK", focusSkills: ["HSK.READING"], slot: "SAT_09_00", expect: "M-HSK" },
];

for (const scenario of scenarios) {
  const parsed = validateStudentRequest({
    requestId: "EXT-" + scenario.domain,
    goal: { domain: scenario.domain, focusSkills: scenario.focusSkills },
    hardConstraints: { maxPricePerHour: 500000 },
    availability: [scenario.slot],
  });
  check(scenario.domain + " request validates", parsed.ok);
  if (!parsed.ok) continue;

  const response: MatchResponse = matchMentors({ request: parsed.value, mentors: mentors.value, topK: 3 });

  check(scenario.domain + " has recommendations", response.recommendations.length > 0);
  check(scenario.domain + " picks the right mentor", response.recommendations[0].mentorId === scenario.expect);
  check(scenario.domain + " reports engine version", response.engineVersion === ENGINE_VERSION);
  check(scenario.domain + " reports package version", response.packageVersion === PACKAGE_VERSION);
  check(scenario.domain + " reports config versions", typeof response.configVersions.weights === "string");

  /* --- Serialize, deserialize, and audit independently ------------------ */
  const roundTripped = JSON.parse(JSON.stringify(response)) as MatchResponse;
  check(scenario.domain + " round-trips", JSON.stringify(roundTripped) === JSON.stringify(response));

  for (const recommendation of roundTripped.recommendations) {
    const mentor = mentors.value.find((m) => m.id === recommendation.mentorId);
    check(scenario.domain + " recommends a known mentor", mentor !== undefined);
    // Audited with the package's own exported checker, not the response's word.
    if (mentor !== undefined) {
      check(
        scenario.domain + " " + recommendation.mentorId + " satisfies hard constraints",
        satisfiesHardConstraints(parsed.value, mentor),
      );
    }
    check(
      scenario.domain + " " + recommendation.mentorId + " has a reason",
      Array.isArray(recommendation.reasons) && recommendation.reasons.length > 0,
    );
    const audited = 100 * Object.entries(recommendation.appliedWeights)
      .reduce((sum, [feature, weight]) => sum + weight * recommendation.scoreBreakdown[feature], 0);
    check(
      scenario.domain + " " + recommendation.mentorId + " score is reproducible",
      Math.abs(audited - recommendation.matchScore) <= 0.005,
    );
  }
}

/* --- Infeasible request -------------------------------------------------- */
const impossible = validateStudentRequest({
  requestId: "EXT-IMPOSSIBLE",
  goal: { domain: "IELTS" },
  hardConstraints: { maxPricePerHour: 1 },
});
if (impossible.ok) {
  const response = matchMentors({ request: impossible.value, mentors: mentors.value });
  check("infeasible returns no recommendations", response.recommendations.length === 0);
  check("infeasible is explicit", response.diagnostics.noFeasibleMatch === true);
}

/* --- The adapter example, through the published surface ------------------ */
const adapted = exampleMentorAdapter.toCanonicalMentor({
  id: "DB-1", tenantId: "t1", fullName: "Adapted Mentor", birthYear: 1999,
  identityVerifiedAt: "2026-01-01", credentialsConfirmedAt: "2026-01-02",
  ieltsOverall: 7.5, ieltsListening: 7.5, ieltsReading: 7.5, ieltsWriting: 7.5, ieltsSpeaking: 7.5,
  satTotal: null, satMath: null, satReadingWriting: null, hskLevel: null,
  teachesSkills: ["ielts writing"], availability: [{ weekday: "tue", startTime: "19:00" }],
  hourlyRateVnd: 200000, monthsTeaching: 12, completedSessions: 40, averageRating: 4.5,
  teachingStyleTags: ["PATIENT"], lastLoginAt: null, profileViews: 0,
});
const adaptedValidation = validateMentors([adapted]);
check("adapter output validates", adaptedValidation.ok);
check("adapter canonicalises skills", adapted.expertise[0] === "IELTS.WRITING");
check("adapter canonicalises availability", adapted.availability[0] === "TUE_19_00");
check("adapter drops tenant data", !JSON.stringify(adapted).includes("t1"));

if (adaptedValidation.ok) {
  const request = validateStudentRequest({
    requestId: "EXT-ADAPTER",
    goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
  });
  if (request.ok) {
    const response = matchMentors({ request: request.value, mentors: adaptedValidation.value });
    check("adapter output matches end to end", response.recommendations[0].mentorId === "DB-1");
  }
}

/* --- Report -------------------------------------------------------------- */
if (failures.length > 0) {
  throw new Error("EXTERNAL CONSUMER FAILURES:\\n" + failures.map((failure) => "  - " + failure).join("\\n"));
}
console.log("external consumer: all checks passed");
`;

/**
 * Packs, installs and runs the external consumer.
 *
 * @returns Exit code; non-zero when the packaged engine cannot be consumed.
 */
export function main(): number {
  const workspace = mkdtempSync(join(tmpdir(), "ed4u-consumer-"));

  try {
    console.log("Packing @ed4u/mentor-engine…");
    execFileSync("npm", ["pack", "--pack-destination", workspace], {
      cwd: PACKAGE_ROOT,
      stdio: ["ignore", "pipe", "inherit"],
    });

    const tarball = readdirSync(workspace).find((file) => file.endsWith(".tgz"));
    if (tarball === undefined) {
      console.error("npm pack produced no tarball");
      return 1;
    }

    console.log(`Installing ${tarball} into a throwaway project…`);
    writeFileSync(
      join(workspace, "package.json"),
      `${JSON.stringify(
        { name: "external-consumer", private: true, version: "1.0.0", type: "module" },
        null,
        2,
      )}\n`,
      "utf8",
    );
    writeFileSync(join(workspace, "consumer.ts"), CONSUMER_SOURCE, "utf8");
    writeFileSync(
      join(workspace, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            skipLibCheck: false,
            lib: ["ES2022", "DOM"],
            outDir: "out",
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    try {
      execFileSync(
        "npm",
        ["install", "--no-audit", "--no-fund", "--ignore-scripts", join(workspace, tarball)],
        { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] },
      );
      console.log("  installed with npm install");
    } catch {
      // Some environments block project-scoped installs. Fall back to unpacking
      // the tarball by hand: the point of this test is that ONLY published files
      // are used, and extraction preserves that guarantee exactly.
      console.log("  npm install unavailable here; unpacking the tarball directly");
      const target = join(workspace, "node_modules", "@ed4u", "mentor-engine");
      mkdirSync(target, { recursive: true });
      execFileSync("tar", ["-xzf", join(workspace, tarball), "-C", target, "--strip-components=1"], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      // The single runtime dependency, copied rather than resolved from this
      // repository, so nothing here is on the consumer's module path.
      cpSync(join(PACKAGE_ROOT, "node_modules", "zod"), join(workspace, "node_modules", "zod"), {
        recursive: true,
      });
    }

    const tsc = join(PACKAGE_ROOT, "node_modules", ".bin", "tsc");
    console.log("Typechecking the packed package from a strict external NodeNext project…");
    execFileSync(tsc, ["--project", "tsconfig.json", "--noEmit"], {
      cwd: workspace,
      stdio: "inherit",
    });
    console.log("  external TypeScript typecheck passed");

    // Emit the same checked consumer, then run it under plain Node.
    execFileSync(tsc, ["--project", "tsconfig.json"], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "inherit"],
    });

    console.log("Running the compiled consumer under plain Node…\n");
    // `cwd` is the temp project: nothing in this repository is on the module
    // path, so a missing published asset cannot be masked by a local file.
    const output = execFileSync("node", ["out/consumer.js"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    console.log(output.trim());

    console.log("\nExternal consumer verified against the packed tarball.");
    return 0;
  } catch (error) {
    console.error(`External consumer FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/* Run when invoked directly. */
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  process.exitCode = main();
}
