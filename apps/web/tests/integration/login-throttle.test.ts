import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createLoginThrottle } from "../../src/lib/security/loginThrottleCore";
import { createTestClient } from "./harness";

const db = createTestClient();
const { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } = createLoginThrottle(db);
const ip = "198.51.100.27";
const code = "RATE-LIMIT-E2E";

beforeEach(async () => {
  await db.authThrottle.deleteMany();
});

afterAll(async () => {
  await db.authThrottle.deleteMany();
  await db.$disconnect();
});

describe("database-backed login throttle", () => {
  it("locks the pair after repeated failures and resets after success", async () => {
    await expect(assertLoginAllowed(ip, code)).resolves.toBeUndefined();
    for (let index = 0; index < 5; index += 1) await recordLoginFailure(ip, code);
    await expect(assertLoginAllowed(ip, code)).rejects.toThrow(/giới hạn/i);

    await recordLoginSuccess(ip, code);
    await expect(assertLoginAllowed(ip, code)).resolves.toBeUndefined();
  });
});
