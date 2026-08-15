import { createHash } from "node:crypto";
import { ValidationError, err, ok, type Result } from "./errors";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
]);

const EXECUTABLE_EXT = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "dll",
  "so",
  "dylib",
  "app",
  "scr",
  "jar",
  "bin",
]);

export function fileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
}

export function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function validateUpload(input: {
  filename: string;
  mime: string;
  size: number;
}): Result<{ filename: string; mime: string }, ValidationError> {
  const filename = sanitizeFilename(input.filename);
  const ext = fileExtension(filename);
  if (input.size <= 0) {
    return err(new ValidationError("Tệp rỗng."));
  }
  if (input.size > MAX_FILE_BYTES) {
    return err(new ValidationError("Tệp vượt quá giới hạn 25 MiB.", { maxBytes: MAX_FILE_BYTES }));
  }
  if (EXECUTABLE_EXT.has(ext)) {
    return err(new ValidationError("Không cho phép tải lên tệp thực thi.", { ext }));
  }
  if (!ALLOWED_MIME.has(input.mime)) {
    return err(new ValidationError("Định dạng tệp không được hỗ trợ.", { mime: input.mime }));
  }
  return ok({ filename, mime: input.mime });
}
