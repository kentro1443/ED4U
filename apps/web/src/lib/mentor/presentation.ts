import { parseSlotPattern } from "@ed4u/domain";

const SKILL_LABELS: Record<string, string> = {
  "IELTS.WRITING": "IELTS Writing",
  "IELTS.SPEAKING": "IELTS Speaking",
  "IELTS.READING": "IELTS Reading",
  "IELTS.LISTENING": "IELTS Listening",
  "SAT.MATH": "SAT Math",
  "SAT.READING_WRITING": "SAT Reading & Writing",
  "HSK.WRITING": "HSK Viết",
  "HSK.READING": "HSK Đọc",
  "HSK.LISTENING": "HSK Nghe",
};

export function mentorSkillLabel(skill: string): string {
  return SKILL_LABELS[skill] ?? skill.replaceAll("_", " ").replace(".", " · ");
}

export function availabilityLabel(slot: string): string {
  try {
    return parseSlotPattern(slot).label;
  } catch {
    return slot;
  }
}

export const FILTER_REASON_LABELS: Record<string, string> = {
  DOMAIN: "Không đúng lĩnh vực cần học",
  PRICE: "Vượt ngân sách tối đa",
  AVAILABILITY: "Không khớp lịch rảnh",
  UNVERIFIED: "Chưa được ED4U xác minh",
  CREDENTIAL_UNKNOWN: "Chưa có dữ liệu chứng chỉ cần thiết",
  CREDENTIAL_ABSENT: "Đã kiểm tra nhưng không có chứng chỉ cần thiết",
  CREDENTIAL_BELOW_THRESHOLD: "Chứng chỉ chưa đạt ngưỡng yêu cầu",
};

export function filterReasonLabel(reason: string): string {
  return FILTER_REASON_LABELS[reason] ?? reason;
}
