import { describe, expect, it } from "vitest";
import { classifyTeacherNeed, detectSubjects, foldVietnamese } from "../src/lib/teacher/routing";

describe("teacher need classifier", () => {
  it.each([
    ["Xin xác nhận giấy tờ để nộp hồ sơ", "DOCUMENTS"],
    ["Em đang stress và cần tư vấn tâm lý", "WELLBEING"],
    ["Muốn hỏi về học bổng du học", "SCHOLARSHIP"],
    ["Em muốn thành lập CLB Robotics", "EXTRACURRICULAR"],
    ["Em chưa biết chọn ngành đại học nào", "CAREER"],
    ["Cần hỗ trợ học tập môn Toán", "ACADEMIC"],
  ])("classifies %s", (text, category) => {
    expect(classifyTeacherNeed(text).category).toBe(category);
  });

  it("leaves vague requests unresolved instead of fabricating a category", () => {
    expect(classifyTeacherNeed("Em cần nói chuyện với một giáo viên")).toEqual({
      category: null,
      confidence: "UNRESOLVED",
      matchedTerms: [],
    });
  });
});

describe("Vietnamese folding", () => {
  it("strips diacritics and normalises đ so subject terms compare equal", () => {
    expect(foldVietnamese("Hóa Học")).toBe("hoa hoc");
    expect(foldVietnamese("Đại số")).toBe("dai so");
    expect(foldVietnamese("  Vật   lý ")).toBe("vat ly");
  });
});

describe("subject detection", () => {
  it.each([
    ["Em muốn học thêm môn Hóa", ["HOA"]],
    ["Cần người kèm Toán và Vật lý", ["TOAN", "LY"]],
    ["Em muốn luyện IELTS", ["ANH"]],
    ["Nhờ thầy hướng dẫn lập trình", ["TIN"]],
    ["Em cần hỗ trợ Ngữ văn", ["VAN"]],
  ])("detects subjects in %s", (text, expected) => {
    expect(detectSubjects(text)).toEqual(expected);
  });

  it("does not read a subject out of a person's name", () => {
    // "Văn", "Lý" and "Anh" are name components far more often than they are
    // bare subject names, so an unqualified occurrence must not match.
    expect(detectSubjects("Em muốn gặp thầy Nguyễn Văn Bình")).toEqual([]);
    expect(detectSubjects("Cô Lý Thị Bích Ngọc có rảnh không ạ")).toEqual([]);
    expect(detectSubjects("Em cần gặp cô Đinh Phương Anh")).toEqual([]);
  });

  it("returns nothing when no subject is named", () => {
    expect(detectSubjects("Em cần xin giấy xác nhận học sinh")).toEqual([]);
  });
});
