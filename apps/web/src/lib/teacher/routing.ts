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

export const SUBJECT_LABELS: Record<string, string> = {
  TOAN: "Toán",
  VAN: "Ngữ văn",
  ANH: "Tiếng Anh",
  LY: "Vật lý",
  HOA: "Hóa học",
  TIN: "Tin học",
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

/* -------------------------------------------------------------------------- */
/* Subject detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Folds Vietnamese text to unaccented lowercase so "Hóa", "hoa" and "HOA" all
 * compare equal. `đ` has no combining form, so it is mapped explicitly.
 */
export function foldVietnamese(text: string): string {
  return (
    text
      .normalize("NFD")
      // Combining diacritical marks, written as escapes so the source stays
      // readable and cannot be mangled by an editor normalising the file.
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0111/g, "d")
      .replace(/\u0110/g, "D")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Subject phrases, matched against folded text.
 *
 * Deliberately conservative: bare "van", "ly" and "anh" are *not* listed even
 * though they are subject names, because they are also extremely common
 * Vietnamese name components ("Nguyễn Văn Bình", "Lý Thị Bích Ngọc", "Phương
 * Anh"). A student asking for a subject always has a qualifier available
 * ("môn", "ngữ văn", "vật lý", "tiếng Anh"), and a false subject match is worse
 * than no subject match: it silently swaps the shortlist out from under them.
 */
const SUBJECT_RULES: Array<{ subject: string; terms: RegExp[] }> = [
  {
    subject: "TOAN",
    terms: [/\btoan\b/, /\bmath\b/, /\bdai so\b/, /\bhinh hoc\b/, /\bgiai tich\b/],
  },
  { subject: "VAN", terms: [/\bngu van\b/, /\bmon van\b/, /\bvan hoc\b/, /\bliterature\b/] },
  {
    subject: "ANH",
    terms: [/\btieng anh\b/, /\banh van\b/, /\bmon anh\b/, /\benglish\b/, /\bielts\b/, /\btoeic\b/],
  },
  { subject: "LY", terms: [/\bvat ly\b/, /\bmon ly\b/, /\bphysics\b/] },
  { subject: "HOA", terms: [/\bhoa hoc\b/, /\bmon hoa\b/, /\bchemistry\b/] },
  {
    subject: "TIN",
    terms: [
      /\btin hoc\b/,
      /\bmon tin\b/,
      /\blap trinh\b/,
      /\binformatics\b/,
      /\bcomputer science\b/,
      /\bcoding\b/,
    ],
  },
];

/** Subject codes explicitly named in the request. Empty when none is named. */
export function detectSubjects(rawText: string): string[] {
  const folded = foldVietnamese(rawText);
  return SUBJECT_RULES.filter((rule) => rule.terms.some((term) => term.test(folded))).map(
    (rule) => rule.subject,
  );
}

/* -------------------------------------------------------------------------- */
/* Name matching                                                              */
/* -------------------------------------------------------------------------- */

/** Titles and generic words that identify nobody on their own. */
const NAME_STOPWORDS = new Set([
  "thay",
  "co",
  "giao",
  "vien",
  "gv",
  "tim",
  "gap",
  "voi",
  "can",
  "muon",
  "xin",
  "em",
  "toi",
  "la",
  "cua",
  "ve",
  "cho",
  "a",
  "ai",
]);

function distinctiveTokens(text: string): string[] {
  return foldVietnamese(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !NAME_STOPWORDS.has(token));
}

/**
 * How strongly a request names this particular teacher, 0 when it does not.
 *
 * The bar is deliberately high. A single shared token is never enough: "Cần hỗ
 * trợ môn Hóa" shares "hoa" with a teacher surnamed Hoàng, and treating that as
 * a name lookup would throw away a perfectly good subject match. The signals
 * that do count are a contiguous full-name hit, the member code, two or more
 * distinctive tokens, or a query that is *only* a name.
 */
function scoreNameMatch(
  rawText: string,
  fullName: string,
  memberCode: string,
): { score: number; reason: string } | null {
  const folded = foldVietnamese(rawText);
  const foldedName = foldVietnamese(fullName);

  // `—` is the placeholder for a missing membership, not a searchable code.
  if (/^[a-z]{2}\d+$/i.test(memberCode) && new RegExp(`\\b${memberCode}\\b`, "i").test(folded)) {
    return { score: 100, reason: `Khớp mã giáo viên ${memberCode}.` };
  }
  // Word-boundary anchored: a bare `includes` would let a short folded name
  // like "co lan" match inside an unrelated run of letters.
  const nameBoundary = new RegExp(`\\b${foldedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  if (foldedName.length > 0 && nameBoundary.test(folded)) {
    return { score: 95, reason: `Khớp đúng tên "${fullName}".` };
  }

  const nameTokens = distinctiveTokens(fullName);
  if (nameTokens.length === 0) return null;
  const queryTokens = distinctiveTokens(rawText);
  if (queryTokens.length === 0) return null;

  const querySet = new Set(queryTokens);
  const shared = nameTokens.filter((token) => querySet.has(token));
  if (shared.length === 0) return null;

  // The final token is the given name — the one Vietnamese speakers actually
  // address someone by, and the one a student is most likely to type alone.
  const givenName = nameTokens[nameTokens.length - 1]!;
  const givenMatched = querySet.has(givenName);

  if (shared.length >= 2) {
    return { score: 80 + shared.length, reason: `Khớp tên "${fullName}".` };
  }
  // "Cô Lan", "thầy Bình": one distinctive token, but the whole request is that
  // token, so it cannot be about anything else.
  if (givenMatched && queryTokens.length === 1) {
    return { score: 75, reason: `Khớp tên gọi "${fullName}".` };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                    */
/* -------------------------------------------------------------------------- */

export type TeacherMatchBasis = "NAME" | "SUBJECT" | "RESPONSIBILITY" | "WORKLOAD_ONLY";

export interface TeacherRouteResult {
  teacherId: string;
  fullName: string;
  schoolMemberCode: string;
  responsibilities: string[];
  officeHours: string[];
  subjects: string[];
  activeApplications: number;
  activeAppointments: number;
  workloadScore: number;
  /** Strength of the name/subject/responsibility match. 0 when unfiltered. */
  matchScore: number;
  reasons: string[];
}

export interface TeacherRoutingOutcome {
  classification: ClassifiedTeacherNeed;
  /** Subject codes named in the request. */
  detectedSubjects: string[];
  /** Which signal actually decided the shortlist. */
  matchedBy: TeacherMatchBasis;
  teachers: TeacherRouteResult[];
}

/**
 * Deterministic teacher routing. It is intentionally not branded as an AI
 * engine: it resolves the request against three explicit signals, then ranks
 * what survives by workload.
 *
 * Signals are tried strongest-first, because they answer different questions:
 *   1. NAME           — the student already knows who they want. Nothing else
 *                       should be allowed to outrank an explicit person.
 *   2. SUBJECT        — "môn Hóa" is answered by chemistry teachers, not by
 *                       whoever happens to hold the broad ACADEMIC duty.
 *   3. RESPONSIBILITY — the classified purpose (documents, wellbeing, …).
 *   4. WORKLOAD_ONLY  — nothing was resolved; show everyone rather than guess.
 *
 * A signal only wins if it actually matches somebody. An unmatched name falls
 * through to subject and purpose instead of returning an empty shortlist.
 */
export async function routeTeachers(
  db: PrismaClient,
  input: { tenantId: string; rawText: string; limit?: number },
): Promise<TeacherRoutingOutcome> {
  const classification = classifyTeacherNeed(input.rawText);
  const detectedSubjects = detectSubjects(input.rawText);
  const category = classification.category;

  // The staff roster is small and every signal needs the whole set, so it is
  // read once and narrowed in memory rather than guessed at in SQL.
  const profiles = await db.teacherProfile.findMany({
    where: {
      tenantId: input.tenantId,
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

  interface Candidate {
    profile: (typeof profiles)[number];
    memberCode: string;
    matchScore: number;
    reasons: string[];
  }

  const withCodes = profiles.map((profile) => ({
    profile,
    memberCode: profile.user.memberships[0]?.schoolMemberCode ?? "—",
  }));

  let matchedBy: TeacherMatchBasis = "WORKLOAD_ONLY";
  let candidates: Candidate[] = [];

  const named = withCodes
    .map((entry) => ({
      ...entry,
      name: scoreNameMatch(input.rawText, entry.profile.user.fullName, entry.memberCode),
    }))
    .filter((entry) => entry.name !== null);

  const subjectMatched = detectedSubjects.length
    ? withCodes.filter((entry) =>
        entry.profile.subjects.some((subject) => detectedSubjects.includes(subject)),
      )
    : [];

  if (named.length > 0) {
    matchedBy = "NAME";
    candidates = named.map((entry) => ({
      profile: entry.profile,
      memberCode: entry.memberCode,
      matchScore: entry.name!.score,
      reasons: [entry.name!.reason],
    }));
  } else if (subjectMatched.length > 0) {
    matchedBy = "SUBJECT";
    candidates = subjectMatched.map((entry) => {
      const taught = entry.profile.subjects.filter((subject) => detectedSubjects.includes(subject));
      // Teaching the subject is the reason they are here; also holding the
      // classified duty is a tie-break, not a second qualification.
      const alsoResponsible = category ? entry.profile.responsibilities.includes(category) : false;
      return {
        profile: entry.profile,
        memberCode: entry.memberCode,
        matchScore: 60 + (alsoResponsible ? 10 : 0),
        reasons: [
          `Dạy môn ${taught.map((code) => SUBJECT_LABELS[code] ?? code).join(", ")}.`,
          ...(alsoResponsible
            ? [`Đồng thời phụ trách ${TEACHER_RESPONSIBILITY_LABELS[category!] ?? category}.`]
            : []),
        ],
      };
    });
  } else {
    const responsible = category
      ? withCodes.filter((entry) => entry.profile.responsibilities.includes(category))
      : [];
    if (responsible.length > 0) {
      matchedBy = "RESPONSIBILITY";
      candidates = responsible.map((entry) => ({
        profile: entry.profile,
        memberCode: entry.memberCode,
        matchScore: 40,
        reasons: [`Phụ trách ${TEACHER_RESPONSIBILITY_LABELS[category!] ?? category}.`],
      }));
    } else {
      matchedBy = "WORKLOAD_ONLY";
      candidates = withCodes.map((entry) => ({
        profile: entry.profile,
        memberCode: entry.memberCode,
        matchScore: 0,
        reasons: ["Chưa xác định được tên hoặc danh mục; hiển thị theo tải công việc."],
      }));
    }
  }

  const ranked = await Promise.all(
    candidates.map(async (candidate): Promise<TeacherRouteResult> => {
      const { profile } = candidate;
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
        schoolMemberCode: candidate.memberCode,
        responsibilities: [...profile.responsibilities],
        officeHours: [...profile.officeHours],
        subjects: [...profile.subjects],
        activeApplications,
        activeAppointments,
        workloadScore,
        matchScore: candidate.matchScore,
        reasons: [
          ...candidate.reasons,
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
      b.matchScore - a.matchScore ||
      b.workloadScore - a.workloadScore ||
      a.activeApplications - b.activeApplications ||
      a.fullName.localeCompare(b.fullName, "vi"),
  );
  return {
    classification,
    detectedSubjects,
    matchedBy,
    teachers: ranked.slice(0, input.limit ?? 5),
  };
}
