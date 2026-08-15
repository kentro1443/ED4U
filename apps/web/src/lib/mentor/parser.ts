import type { Domain, Skill, TeachingStyle, Language } from "@ed4u/mentor-engine";
import { domainOfSkill, validateStudentRequest, type StudentRequest } from "@ed4u/mentor-engine";

export interface ParsedStudentRequestDTO {
  rawText: string;
  domain: Domain | null;
  currentScore?: number;
  targetScore?: number;
  focusSkills: Skill[];
  maxPricePerHour?: number;
  availability: string[];
  teachingStyles: TeachingStyle[];
  languages: Language[];
  verifiedOnly: boolean;
  unhandledFragments: string[];
  parserNotes: string[];
  canonicalRequest?: StudentRequest;
}

/**
 * Natural language parser for ED4U Student Mentor requests.
 *
 * Deterministic rule-based NLP parser covering Vietnamese shorthand,
 * exam scales (IELTS/SAT/HSK), time patterns, and budget numbers.
 */
export function parseMentorPrompt(
  rawText: string,
  requestId: string = `req_${Date.now()}`,
): ParsedStudentRequestDTO {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const notes: string[] = [];
  const unhandled: string[] = [];

  // 1. Detect Domain. Unknown remains unknown until the student confirms it.
  let domain: Domain | null = null;
  if (/(?:sat|digital sat)/i.test(lower)) {
    domain = "SAT";
  } else if (/(?:hsk|tiếng trung|tieng trung|hsk\s*[1-6])/i.test(lower)) {
    domain = "HSK";
  } else if (/(?:ielts|ielts\s*academic|ielts\s*general)/i.test(lower)) {
    domain = "IELTS";
  }
  if (domain === null) {
    notes.push(
      "Chưa xác định được chứng chỉ/lĩnh vực. Vui lòng chọn IELTS, SAT hoặc HSK trước khi chạy engine.",
    );
  }

  // 2. Detect Scores (Current & Target)
  let currentScore: number | undefined;
  let targetScore: number | undefined;

  if (domain === "IELTS") {
    const rangeMatch =
      /(?:từ\s*)?([4-9](?:\.[05])?)\s*(?:->|–|-|lên|sang|đến|to)\s*([4-9](?:\.[05])?)/i.exec(lower);
    if (rangeMatch) {
      currentScore = parseFloat(rangeMatch[1]!);
      targetScore = parseFloat(rangeMatch[2]!);
    } else {
      const currentMatch =
        /(?:hiện tại|đang|khoảng|band|đang ở mức|được)\s*([4-9](?:\.[05])?)/i.exec(lower);
      if (currentMatch) currentScore = parseFloat(currentMatch[1]!);

      const targetMatch =
        /(?:lên|mục tiêu|target|aim|muốn đạt|cần|lên được)\s*([4-9](?:\.[05])?)/i.exec(lower);
      if (targetMatch) targetScore = parseFloat(targetMatch[1]!);
    }
  } else if (domain === "SAT") {
    const satRange =
      /([4-9]\d{2}|1[0-5]\d{2}|1600)\s*(?:->|–|-|lên|to)\s*([4-9]\d{2}|1[0-5]\d{2}|1600)/i.exec(
        lower,
      );
    if (satRange) {
      currentScore = parseInt(satRange[1]!, 10);
      targetScore = parseInt(satRange[2]!, 10);
    } else {
      const satMatch = /(?:target|aim|mục tiêu|lên)\s*([4-9]\d{2}|1[0-5]\d{2}|1600)/i.exec(lower);
      if (satMatch) targetScore = parseInt(satMatch[1]!, 10);
    }
  } else if (domain === "HSK") {
    const hskRange = /(?:hsk\s*)?([1-6])\s*(?:->|–|-|lên|to)\s*(?:hsk\s*)?([1-6])/i.exec(lower);
    if (hskRange) {
      currentScore = parseInt(hskRange[1]!, 10);
      targetScore = parseInt(hskRange[2]!, 10);
    } else {
      const hskTarget = /(?:lên|mục tiêu|target|đạt)\s*(?:hsk\s*)?([1-6])/i.exec(lower);
      if (hskTarget) targetScore = parseInt(hskTarget[1]!, 10);
    }
  }

  // 3. Detect Focus Skills
  const focusSkills: Skill[] = [];
  if (domain === "IELTS") {
    if (/(?:writing|viết|task 1|task 2|essay)/i.test(lower)) {
      focusSkills.push("IELTS.WRITING");
    }
    if (/(?:speaking|nói|phát âm|fluency)/i.test(lower)) {
      focusSkills.push("IELTS.SPEAKING");
    }
    if (/(?:reading|đọc|đọc hiểu)/i.test(lower)) {
      focusSkills.push("IELTS.READING");
    }
    if (/(?:listening|nghe)/i.test(lower)) {
      focusSkills.push("IELTS.LISTENING");
    }
  } else if (domain === "SAT") {
    if (/(?:math|toán)/i.test(lower)) {
      focusSkills.push("SAT.MATH");
    }
    if (/(?:reading|writing|verbal|đọc hiểu|ngữ pháp)/i.test(lower)) {
      focusSkills.push("SAT.READING_WRITING");
    }
  } else if (domain === "HSK") {
    if (/(?:writing|viết)/i.test(lower)) focusSkills.push("HSK.WRITING");
    if (/(?:reading|đọc)/i.test(lower)) focusSkills.push("HSK.READING");
    if (/(?:listening|nghe)/i.test(lower)) focusSkills.push("HSK.LISTENING");
  }

  // 4. Detect Budget (Explicit numbers only)
  let maxPricePerHour: number | undefined;

  const kBudgetMatch =
    /(?:ngân sách|học phí|khoảng|tầm|tối đa|dưới|budget)\s*(?:là|khoảng)?\s*([1-9]\d{1,3})\s*k/i.exec(
      lower,
    ) ?? /([1-9]\d{1,3})\s*k\s*(?:\/|\s*trên\s*|\s*1\s*)?\s*(?:giờ|h|hour|buổi)/i.exec(lower);

  const fullNumberBudgetMatch =
    /(?:ngân sách|học phí|khoảng|tối đa|dưới)?\s*([1-9]\d{2}(?:\.\d{3})+|[1-9]\d{4,6})\s*(?:đ|vnd|đồng)/i.exec(
      lower,
    );

  if (kBudgetMatch) {
    maxPricePerHour = parseInt(kBudgetMatch[1]!, 10) * 1000;
  } else if (fullNumberBudgetMatch) {
    const cleaned = fullNumberBudgetMatch[1]!.replace(/\./g, "");
    maxPricePerHour = parseInt(cleaned, 10);
  }

  if (
    /(?:ngân sách rẻ|tiết kiệm|giá sinh viên|hợp túi tiền|giá rẻ)/i.test(lower) &&
    !maxPricePerHour
  ) {
    notes.push(
      "Yêu cầu có nhắc đến ngân sách tiết kiệm nhưng không nêu số tiền cụ thể; chưa đặt mức giá trần cứng.",
    );
  }

  // 5. Detect Availability Days & Times
  const availability: string[] = [];
  const days: string[] = [];

  if (/(?:thứ 2|thứ hai|t2|monday|mon)/i.test(lower)) days.push("MON");
  if (/(?:thứ 3|thứ ba|t3|tuesday|tue)/i.test(lower)) days.push("TUE");
  if (/(?:thứ 4|thứ tư|t4|wednesday|wed)/i.test(lower)) days.push("WED");
  if (/(?:thứ 5|thứ năm|t5|thursday|thu)/i.test(lower)) days.push("THU");
  if (/(?:thứ 6|thứ sáu|t6|friday|fri)/i.test(lower)) days.push("FRI");
  if (/(?:thứ 7|thứ bảy|t7|saturday|sat)/i.test(lower)) days.push("SAT");
  if (/(?:chủ nhật|cn|sunday|sun)/i.test(lower)) days.push("SUN");

  // Periods
  const hasEvening = /(?:buổi tối|vào tối|tối(?!\s*đa)|evening|night|sau 18h|sau 19h)/i.test(lower);
  const hasAfternoon = /(?:chiều|buổi chiều|afternoon)/i.test(lower);
  const hasMorning = /(?:sáng|buổi sáng|morning)/i.test(lower);

  const defaultSlots = hasEvening
    ? ["19_00", "20_00"]
    : hasAfternoon
      ? ["14_00", "15_00"]
      : hasMorning
        ? ["08_00", "09_00"]
        : ["19_00"];

  if (days.length > 0) {
    for (const day of days) {
      for (const slot of defaultSlots) {
        availability.push(`${day}_${slot}`);
      }
    }
  }

  // 6. Teaching Styles
  const teachingStyles: TeachingStyle[] = [];
  if (/(?:cấu trúc|bài bản|structured|ngăn nắp|rõ ràng)/i.test(lower)) {
    teachingStyles.push("STRUCTURED");
  }
  if (/(?:linh hoạt|flexible|thoải mái|tự do)/i.test(lower)) {
    teachingStyles.push("FLEXIBLE");
  }
  if (/(?:thực hành|luyện đề|practical|chiến thuật)/i.test(lower)) {
    teachingStyles.push("EXAM_FOCUSED");
  }
  if (/(?:truyền cảm hứng|nhiệt tình|inspiring|động lực)/i.test(lower)) {
    teachingStyles.push("MOTIVATING");
  }

  // 7. Verified Only
  const verifiedOnly = /(?:xác minh|đã xác minh|verified|chứng chỉ thật|uy tín)/i.test(lower);

  // 8. Construct Canonical StudentRequest
  const rawCanonical = domain
    ? {
        requestId,
        goal: {
          domain,
          ...(currentScore !== undefined ? { currentScore } : {}),
          ...(targetScore !== undefined ? { targetScore } : {}),
          focusSkills: focusSkills.filter((s) => domainOfSkill(s) === domain),
        },
        hardConstraints: {
          verifiedOnly,
          ...(maxPricePerHour !== undefined ? { maxPricePerHour } : {}),
          requiredExpertise: [],
          requireAllAvailability: false,
        },
        availability,
        softPreferences: {
          teachingStyles,
          languages: ["VI"] as Language[],
        },
        additionalPreferences: unhandled,
      }
    : null;

  const validation = rawCanonical ? validateStudentRequest(rawCanonical) : null;
  const canonicalRequest = validation?.ok ? validation.value : undefined;

  return {
    rawText,
    domain,
    currentScore,
    targetScore,
    focusSkills,
    maxPricePerHour,
    availability,
    teachingStyles,
    languages: ["VI"],
    verifiedOnly,
    unhandledFragments: unhandled,
    parserNotes: notes,
    canonicalRequest,
  };
}
