import { describe, expect, it } from "vitest";
import { parseTimetableCsv } from "../src/academic/timetableImport";

const HEADER = "class_code,subject_code,teacher_code,room_code,weekday,period_code";

describe("timetable CSV import", () => {
  it("accepts a consistent timetable", () => {
    const result = parseTimetableCsv(
      [HEADER, "10A1,TOAN,GV000001,R05,MON,P1", "10A2,VAN,GV000002,R06,MON,P1"].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows.at(0)).toMatchObject({
      classCode: "10A1",
      subjectCode: "TOAN",
      weekday: "MON",
      periodCode: "P1",
    });
  });

  it("accepts Vietnamese weekday shorthand", () => {
    const result = parseTimetableCsv([HEADER, "10A1,TOAN,GV000001,R05,T2,P1"].join("\n"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.at(0)?.weekday).toBe("MON");
  });

  it("rejects a room booked twice in the same period", () => {
    const result = parseTimetableCsv(
      [HEADER, "10A1,TOAN,GV000001,R05,MON,P1", "10A2,VAN,GV000002,R05,MON,P1"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)).toMatchObject({ line: 3, column: "room_code" });
    expect(result.issues.at(0)?.message).toContain("dòng 2");
  });

  it("rejects a teacher scheduled twice in the same period", () => {
    const result = parseTimetableCsv(
      [HEADER, "10A1,TOAN,GV000001,R05,MON,P1", "10A2,TOAN,GV000001,R06,MON,P1"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.column === "teacher_code")).toBe(true);
  });

  it("rejects a class scheduled twice in the same period", () => {
    const result = parseTimetableCsv(
      [HEADER, "10A1,TOAN,GV000001,R05,MON,P1", "10A1,VAN,GV000002,R06,MON,P1"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.column === "class_code")).toBe(true);
  });

  it("allows the same room in different periods", () => {
    const result = parseTimetableCsv(
      [HEADER, "10A1,TOAN,GV000001,R05,MON,P1", "10A2,VAN,GV000002,R05,MON,P2"].join("\n"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown weekday", () => {
    const result = parseTimetableCsv([HEADER, "10A1,TOAN,GV000001,R05,SUN,P1"].join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)?.column).toBe("weekday");
  });

  it("rejects the file when a required column is missing", () => {
    const result = parseTimetableCsv("class_code,subject_code\n10A1,TOAN");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.at(0)?.message).toContain("teacher_code");
  });

  it("names every missing value on a row rather than only the first", () => {
    const result = parseTimetableCsv([HEADER, "10A1,,,,MON,"].join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
  });
});
