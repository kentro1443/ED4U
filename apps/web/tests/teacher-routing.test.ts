import { describe, expect, it } from "vitest";
import { classifyTeacherNeed } from "../src/lib/teacher/routing";

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
