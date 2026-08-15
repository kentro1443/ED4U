import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function storageRoot(): string {
  if (process.env.ED4U_STORAGE_ROOT) return path.resolve(process.env.ED4U_STORAGE_ROOT);
  const cwd = process.cwd();
  return cwd.endsWith(path.join("apps", "web"))
    ? path.resolve(cwd, "..", "..", "storage")
    : path.resolve(cwd, "storage");
}

function assertSafeStorageKey(storageKey: string): string {
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.pdf$/.test(storageKey)) {
    throw new Error("Storage key không hợp lệ.");
  }
  const root = storageRoot();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(root + path.sep))
    throw new Error("Storage key vượt khỏi vùng lưu trữ riêng.");
  return resolved;
}

export async function savePrivatePdf(
  db: PrismaClient,
  input: { tenantId: string; userId: string; file: File },
) {
  const file = input.file;
  if (!file || file.size === 0) throw new Error("Hãy chọn một tệp PDF.");
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF vượt quá giới hạn 10 MB.");
  if (file.type && file.type !== "application/pdf") throw new Error("Chỉ chấp nhận tệp PDF.");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Tệp tải lên không có chữ ký PDF hợp lệ.");
  }
  const id = randomUUID();
  const storageKey = `${input.tenantId}/${id}.pdf`;
  const destination = assertSafeStorageKey(storageKey);
  const temp = `${destination}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
  await rename(temp, destination);

  try {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return await db.storedFile.create({
      data: {
        id,
        tenantId: input.tenantId,
        filename: path.basename(file.name || "application.pdf").slice(0, 200),
        mime: "application/pdf",
        size: bytes.length,
        sha256,
        storageKey,
        createdBy: input.userId,
      },
    });
  } catch (error) {
    await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readPrivateFile(storageKey: string): Promise<Buffer> {
  return readFile(assertSafeStorageKey(storageKey));
}

export async function deletePrivateFile(storageKey: string): Promise<void> {
  await rm(assertSafeStorageKey(storageKey), { force: true });
}
