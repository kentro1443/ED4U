import type { PrismaClient } from "@/generated/prisma/client";

export const TEACHER_RESPONSIBILITY_LABELS: Record<string, string> = {
  ACADEMIC: "Học tập & học thuật",
  COMPETITION: "Kỳ thi / đội tuyển",
  DOCUMENTS: "Giấy tờ & xác nhận",
  ADMINISTRATION: "Hành chính học sinh",
  WELLBEING: "Sức khỏe tinh thần",
  COUNSELLING: "Tư vấn học đường",
  SCHOLARSHIP: "Học bổng",
  STUDY_ABROAD: "Du học",
  EXTRACURRICULAR: "Hoạt động ngoại khóa",
  CLUBS: "Câu lạc bộ",
  CAREER: "Định hướng nghề nghiệp",
  UNIVERSITY: "Đại học / ngành học",
};

export interface ClassifiedTeacherNeed {
  category: string | null;
  confidence: "HIGH" | "MEDIUM" | "UNRESOLVED";
  matchedTerms: string[];
}

const CATEGORY_RULES: Array<{ category: string; terms: RegExp[] }> = [
  {
    category: "DOCUMENTS",
    terms: [/giấy\s*tờ/i, /xác\s*nhận/i, /chứng\s*nhận/i, /đơn\s*xin/i, /hồ\s*sơ\s*hành\s*chính/i],
  },
  {
    category: "WELLBEING",
    terms: [
      /tâm\s*lý/i,
      /stress/i,
      /áp\s*lực/i,
      /lo\s*âu/i,
      /sức\s*khỏe\s*tinh\s*thần/i,
      /counsell/i,
    ],
  },
  {
    category: "SCHOLARSHIP",
    terms: [/học\s*bổng/i, /scholarship/i, /du\s*học/i, /study\s*abroad/i],
  },
  {
    category: "EXTRACURRICULAR",
    terms: [/câu\s*lạc\s*bộ/i, /\bclb\b/i, /ngoại\s*khóa/i, /hoạt\s*động/i, /club/i],
  },
  {
    category: "CAREER",
    terms: [/nghề/i, /career/i, /chọn\s*ngành/i, /đại\s*học/i, /university/i],
  },
  {
    category: "ACADEMIC",
    terms: [
      /học\s*tập/i,
      /điểm/i,
      /môn\s+(?:toán|văn|anh|lý|hóa|tin)/i,
      /thi\s*học\s*sinh\s*giỏi/i,
      /đội\s*tuyển/i,
      /academic/i,
    ],
  },
];

export function classifyTeacherNeed(rawText: string): ClassifiedTeacherNeed {
  const matches = CATEGORY_RULES.map((rule) => ({
    category: rule.category,
    terms: rule.terms.filter((term) => term.test(rawText)).map((term) => term.source),
  })).filter((entry) => entry.terms.length > 0);

  if (matches.length === 0) return { category: null, confidence: "UNRESOLVED", matchedTerms: [] };
  matches.sort((a, b) => b.terms.length - a.terms.length || a.category.localeCompare(b.category));
  return {
    category: matches[0]!.category,
    confidence: matches[0]!.terms.length >= 2 ? "HIGH" : "MEDIUM",
    matchedTerms: matches[0]!.terms,
  };
}

export interface TeacherRouteResult {
  teacherId: string;
  fullName: string;
  schoolMemberCode: string;
  responsibilities: string[];
  officeHours: string[];
  activeApplications: number;
  activeAppointments: number;
  workloadScore: number;
  reasons: string[];
}

/**
 * Deterministic teacher routing: classify responsibility -> hard eligibility ->
 * workload ranking. It is intentionally not branded as an AI engine.
 */
export async function routeTeachers(
  db: PrismaClient,
  input: { tenantId: string; rawText: string; limit?: number },
): Promise<{ classification: ClassifiedTeacherNeed; teachers: TeacherRouteResult[] }> {
  const classification = classifyTeacherNeed(input.rawText);
  const category = classification.category;
  const profiles = await db.teacherProfile.findMany({
    where: {
      tenantId: input.tenantId,
      ...(category ? { responsibilities: { has: category } } : {}),
      user: {
        roles: { some: { role: "TEACHER" } },
        memberships: {
          some: { tenantId: input.tenantId, membershipStatus: "ACTIVE", memberType: "TEACHER" },
        },
      },
    },
    include: {
      user: {
        include: {
          memberships: {
            where: { tenantId: input.tenantId, membershipStatus: "ACTIVE" },
            select: { schoolMemberCode: true },
          },
        },
      },
    },
  });

  const ranked = await Promise.all(
    profiles.map(async (profile): Promise<TeacherRouteResult> => {
      const [activeApplications, activeAppointments] = await Promise.all([
        db.application.count({
          where: {
            tenantId: input.tenantId,
            currentTeacherId: profile.userId,
            status: { in: ["SUBMITTED", "IN_REVIEW", "NEEDS_MORE_INFO"] },
          },
        }),
        db.appointment.count({
          where: {
            tenantId: input.tenantId,
            teacherId: profile.userId,
            status: { in: ["REQUESTED", "ACCEPTED", "RESCHEDULE_PROPOSED"] },
          },
        }),
      ]);
      const workloadScore = Math.max(0, 100 - activeApplications * 10 - activeAppointments * 6);
      return {
        teacherId: profile.userId,
        fullName: profile.user.fullName,
        schoolMemberCode: profile.user.memberships[0]?.schoolMemberCode ?? "—",
        responsibilities: [...profile.responsibilities],
        officeHours: [...profile.officeHours],
        activeApplications,
        activeAppointments,
        workloadScore,
        reasons: [
          ...(category
            ? [`Phụ trách ${TEACHER_RESPONSIBILITY_LABELS[category] ?? category}.`]
            : ["Chưa xác định danh mục; hiển thị theo tải công việc."]),
          `Đang xử lý ${activeApplications} đơn và ${activeAppointments} lịch hẹn.`,
          ...(profile.officeHours.length
            ? [`Có ${profile.officeHours.length} khung giờ tư vấn công bố.`]
            : []),
        ],
      };
    }),
  );

  ranked.sort(
    (a, b) =>
      b.workloadScore - a.workloadScore ||
      a.activeApplications - b.activeApplications ||
      a.fullName.localeCompare(b.fullName, "vi"),
  );
  return { classification, teachers: ranked.slice(0, input.limit ?? 5) };
}
