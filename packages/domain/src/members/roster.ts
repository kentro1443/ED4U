import type { MemberType } from "../roles";

/**
 * Roster import parsing and validation.
 *
 * The import is a transaction: one bad row rejects the whole file. That rule
 * only means something if the reason is reported per row, so an administrator
 * can fix the sheet rather than guess — a bare "import failed" would push them
 * back to entering 800 students by hand.
 *
 * Parsing is deliberately pure and lives in the domain package: the rules that
 * decide whether a roster is acceptable are school policy, not web plumbing,
 * and they are unit-tested without a database.
 */

export const ROSTER_COLUMNS = ["full_name", "class", "school_member_code", "member_type"] as const;

export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

export interface RosterRow {
  /** 1-based line number in the source file, including the header. */
  line: number;
  fullName: string;
  className: string | null;
  schoolMemberCode: string;
  memberType: MemberType;
}

export interface RosterIssue {
  line: number;
  column: RosterColumn | "file";
  message: string;
}

export type RosterParseResult =
  { ok: true; rows: RosterRow[] } | { ok: false; issues: RosterIssue[] };

const MEMBER_CODE_PATTERN = /^[A-Z]{2}\d{6}$/;
const MAX_ROWS = 5000;

/**
 * Splits one CSV line, honouring quoted fields that contain commas or escaped
 * quotes. Schools export names like `Nguyen Van A, Jr.` and a naive split on
 * commas silently shifts every later column.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function normaliseMemberType(value: string): MemberType | null {
  const upper = value.trim().toUpperCase();
  if (upper === "STUDENT" || upper === "HOCSINH" || upper === "HỌC SINH") return "STUDENT";
  if (upper === "TEACHER" || upper === "GIAOVIEN" || upper === "GIÁO VIÊN") return "TEACHER";
  if (upper === "STAFF" || upper === "NHANVIEN" || upper === "NHÂN VIÊN") return "STAFF";
  return null;
}

export function parseRosterCsv(text: string): RosterParseResult {
  const issues: RosterIssue[] = [];

  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part of
  // the first header name and make every column look missing.
  const content = text.replace(/^﻿/, "");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, issues: [{ line: 0, column: "file", message: "Tệp rỗng." }] };
  }

  const header = splitCsvLine(lines[0] ?? "").map((column) => column.toLowerCase());
  const missing = ROSTER_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      issues: [
        {
          line: 1,
          column: "file",
          message: `Thiếu cột bắt buộc: ${missing.join(", ")}. Cần đủ: ${ROSTER_COLUMNS.join(", ")}.`,
        },
      ],
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    return {
      ok: false,
      issues: [{ line: 1, column: "file", message: "Tệp chỉ có dòng tiêu đề, không có dữ liệu." }],
    };
  }
  if (dataLines.length > MAX_ROWS) {
    return {
      ok: false,
      issues: [
        {
          line: 1,
          column: "file",
          message: `Tối đa ${MAX_ROWS} dòng mỗi lần nhập; tệp có ${dataLines.length} dòng.`,
        },
      ],
    };
  }

  const indexOf = (column: RosterColumn) => header.indexOf(column);
  const rows: RosterRow[] = [];
  const seenCodes = new Map<string, number>();

  dataLines.forEach((rawLine, offset) => {
    const line = offset + 2; // header is line 1
    const fields = splitCsvLine(rawLine);

    const fullName = fields[indexOf("full_name")] ?? "";
    const className = fields[indexOf("class")] ?? "";
    const code = (fields[indexOf("school_member_code")] ?? "").toUpperCase();
    const rawType = fields[indexOf("member_type")] ?? "";

    if (fullName.length < 2 || fullName.length > 120) {
      issues.push({ line, column: "full_name", message: "Họ tên phải có 2–120 ký tự." });
    }
    if (!MEMBER_CODE_PATTERN.test(code)) {
      issues.push({
        line,
        column: "school_member_code",
        message: `Mã "${code || "(trống)"}" không đúng định dạng: 2 chữ cái + 6 chữ số, ví dụ HS000001.`,
      });
    } else {
      const previous = seenCodes.get(code);
      if (previous !== undefined) {
        issues.push({
          line,
          column: "school_member_code",
          message: `Mã ${code} bị trùng với dòng ${previous} trong cùng tệp.`,
        });
      } else {
        seenCodes.set(code, line);
      }
    }

    const memberType = normaliseMemberType(rawType);
    if (!memberType) {
      issues.push({
        line,
        column: "member_type",
        message: `member_type "${rawType || "(trống)"}" không hợp lệ. Dùng STUDENT, TEACHER hoặc STAFF.`,
      });
    }
    if (memberType === "STUDENT" && !className) {
      issues.push({ line, column: "class", message: "Học sinh bắt buộc phải có lớp." });
    }

    if (memberType && MEMBER_CODE_PATTERN.test(code)) {
      rows.push({
        line,
        fullName,
        className: className || null,
        schoolMemberCode: code,
        memberType,
      });
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, rows };
}
