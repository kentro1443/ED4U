import { describe, expect, it } from "vitest";
import { parseRosterCsv, splitCsvLine } from "../src/members/roster";

const HEADER = "full_name,class,school_member_code,member_type";

describe("roster CSV parsing", () => {
  it("accepts a well-formed roster", () => {
    const result = parseRosterCsv(
      [HEADER, "Nguyen Van A,10A1,HS000101,STUDENT", "Tran Thi B,,GV000101,TEACHER"].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows.at(0)).toMatchObject({
      line: 2,
      fullName: "Nguyen Van A",
      className: "10A1",
      schoolMemberCode: "HS000101",
      memberType: "STUDENT",
    });
    expect(result.rows.at(1)?.className).toBeNull();
  });

  it("keeps quoted commas inside a single field", () => {
    expect(splitCsvLine('"Nguyen Van A, Jr.",10A1,HS000101,STUDENT')).toEqual([
      "Nguyen Van A, Jr.",
      "10A1",
      "HS000101",
      "STUDENT",
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(splitCsvLine('"She said ""hi""",10A1,HS000101,STUDENT').at(0)).toBe('She said "hi"');
  });

  it("tolerates the BOM Excel writes", () => {
    const result = parseRosterCsv(`\uFEFF${HEADER}\nNguyen Van A,10A1,HS000101,STUDENT`);
    expect(result.ok).toBe(true);
  });

  it("rejects the whole file when a column is missing", () => {
    const result = parseRosterCsv("full_name,class\nNguyen Van A,10A1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)?.message).toContain("school_member_code");
  });

  it("reports the offending line for a malformed member code", () => {
    const result = parseRosterCsv(
      [HEADER, "Nguyen Van A,10A1,HS000101,STUDENT", "Tran Thi B,10A1,BAD,STUDENT"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues.at(0)).toMatchObject({ line: 3, column: "school_member_code" });
  });

  it("rejects a duplicate code within the same file and names both lines", () => {
    const result = parseRosterCsv(
      [HEADER, "Nguyen Van A,10A1,HS000101,STUDENT", "Tran Thi B,10A2,HS000101,STUDENT"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)?.message).toContain("dòng 2");
  });

  it("requires a class for students but not for teachers", () => {
    const result = parseRosterCsv([HEADER, "Nguyen Van A,,HS000101,STUDENT"].join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)?.column).toBe("class");
  });

  it("accepts Vietnamese member type labels", () => {
    const result = parseRosterCsv([HEADER, "Tran Thi B,,GV000101,Giáo viên"].join("\n"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.at(0)?.memberType).toBe("TEACHER");
  });

  it("refuses a file with only a header", () => {
    const result = parseRosterCsv(HEADER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)?.message).toContain("không có dữ liệu");
  });

  it("collects every bad row rather than stopping at the first", () => {
    const result = parseRosterCsv([HEADER, "A,10A1,BAD1,STUDENT", "B,10A1,BAD2,NOPE"].join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
