export function assertNever(value: never, message = "unexpected value"): never {
  throw new Error(`${message}: ${String(value)}`);
}

export function sha256Hex(input: string): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
