import "server-only";
import { db } from "@/lib/db";
import { createLoginThrottle } from "./loginThrottleCore";

const throttle = createLoginThrottle(db);

export const assertLoginAllowed = throttle.assertLoginAllowed;
export const recordLoginFailure = throttle.recordLoginFailure;
export const recordLoginSuccess = throttle.recordLoginSuccess;
export const pruneLoginThrottle = throttle.pruneLoginThrottle;
