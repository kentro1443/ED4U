import { createHash } from "node:crypto";
import { PrismaClient } from "../apps/web/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

const DEMO_PASSWORD = "TempPass1!";

const url = process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5432/ed4u";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function uuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic pseudo-random integer in `[min, max]`, derived from a seed string. */
function pick(seed: string, min: number, max: number): number {
  const h = createHash("sha256").update(seed).digest();
  return min + (h.readUInt32BE(0) % (max - min + 1));
}

/**
 * A plausible date of birth for a demo identity, derived deterministically so
 * re-seeding never changes anyone's age.
 *
 * Stored as a UTC midnight so the DATE column holds exactly this calendar day
 * regardless of where the seed runs.
 */
function demoDateOfBirth(seed: string, minYear: number, maxYear: number): Date {
  const year = pick(`${seed}:y`, minYear, maxYear);
  const month = pick(`${seed}:m`, 1, 12);
  // 28 keeps every month valid without special-casing February.
  const day = pick(`${seed}:d`, 1, 28);
  return new Date(Date.UTC(year, month - 1, day));
}

const DEMO_VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Seed-only helper: returns the next Mon–Fri occurrence at a Vietnam school-local
 * wall-clock time. The demo tenant is fixed to Asia/Ho_Chi_Minh (UTC+7, no DST),
 * so doing the civil-date arithmetic on a +07:00 shifted instant is explicit and
 * host-timezone independent. General academic civil→instant conversion belongs
 * to the Calendar slice; do not reuse this helper as production time logic.
 */
function nextDemoSchoolWeekdayAt(seedNow: Date, hour: number, minute = 0): Date {
  const vietnamNow = new Date(seedNow.getTime() + DEMO_VIETNAM_OFFSET_MS);
  const year = vietnamNow.getUTCFullYear();
  const month = vietnamNow.getUTCMonth();
  const day = vietnamNow.getUTCDate();

  for (let delta = 1; delta <= 7; delta += 1) {
    const civilCandidate = new Date(Date.UTC(year, month, day + delta, hour, minute));
    const weekday = civilCandidate.getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      return new Date(civilCandidate.getTime() - DEMO_VIETNAM_OFFSET_MS);
    }
  }
  throw new Error("Could not find the next demo school weekday");
}

type DemoGender = "FEMALE" | "MALE" | "OTHER" | "UNDISCLOSED";

async function main() {
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  // Operational fixtures intentionally move with seed time so they never become
  // stale demo history. Their IDs/relationships remain deterministic.
  const seedNow = new Date();
  const tenantId = uuid("tenant:ed4u-demo");

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { timezone: "Asia/Ho_Chi_Minh" },
    create: {
      id: tenantId,
      slug: "ed4u-demo",
      name: "ED4U Demo High School",
      timezone: "Asia/Ho_Chi_Minh",
    },
  });

  await prisma.operationalHours.upsert({
    where: { tenantId },
    update: {},
    create: { id: uuid("hours"), tenantId, startMinutes: 7 * 60, endMinutes: 20 * 60 },
  });

  const yearId = uuid("year:2026");
  await prisma.academicYear.upsert({
    where: { id: yearId },
    update: {},
    create: {
      id: yearId,
      tenantId,
      name: "2026–2027",
      startsOn: new Date("2026-08-15"),
      endsOn: new Date("2027-05-31"),
    },
  });
  const semId = uuid("sem:1");
  await prisma.semester.upsert({
    where: { id: semId },
    update: {},
    create: {
      id: semId,
      yearId,
      name: "Học kỳ 1",
      startsOn: new Date("2026-08-15"),
      endsOn: new Date("2026-12-31"),
    },
  });

  const periodTimes = [
    ["P1", "07:30", "08:15"],
    ["P2", "08:20", "09:05"],
    ["P3", "09:10", "09:55"],
    ["P4", "10:10", "10:55"],
    ["P5", "11:00", "11:45"],
    ["P6", "13:00", "13:45"],
    ["P7", "13:50", "14:35"],
    ["P8", "14:40", "15:25"],
  ] as const;
  for (let i = 0; i < periodTimes.length; i++) {
    const p = periodTimes[i]!;
    await prisma.academicPeriod.upsert({
      where: { id: uuid(`period:${p[0]}`) },
      update: {},
      create: {
        id: uuid(`period:${p[0]}`),
        tenantId,
        code: p[0],
        startTime: p[1],
        endTime: p[2],
        sortOrder: i + 1,
      },
    });
  }

  const grades = ["10", "11", "12"];
  const classIds: string[] = [];
  for (const g of grades) {
    for (let n = 1; n <= 4; n++) {
      const code = `${g}A${n}`;
      const id = uuid(`class:${code}`);
      classIds.push(id);
      await prisma.class.upsert({
        where: { id },
        update: {},
        create: { id, tenantId, code, name: `Lớp ${code}`, grade: g },
      });
    }
  }

  const subjects = [
    ["TOAN", "Toán"],
    ["VAN", "Ngữ văn"],
    ["ANH", "Tiếng Anh"],
    ["LY", "Vật lý"],
    ["HOA", "Hóa học"],
    ["TIN", "Tin học"],
  ] as const;
  for (const [code, name] of subjects) {
    await prisma.subject.upsert({
      where: { id: uuid(`subject:${code}`) },
      update: {},
      create: { id: uuid(`subject:${code}`), tenantId, code, name },
    });
  }

  const typeCodes = [
    ["CLASSROOM", "Phòng học"],
    ["MUSIC_ROOM", "Phòng nhạc"],
    ["COMPUTER_LAB", "Phòng máy"],
    ["SCIENCE_LAB", "Phòng thí nghiệm"],
    ["AUDITORIUM", "Hội trường"],
    ["MEETING_ROOM", "Phòng họp"],
  ] as const;
  for (const [code, name] of typeCodes) {
    await prisma.roomType.upsert({
      where: { id: uuid(`rtype:${code}`) },
      update: {},
      create: { id: uuid(`rtype:${code}`), tenantId, code, name },
    });
  }
  const featureCodes = [
    "PROJECTOR",
    "PIANO",
    "SOUND_SYSTEM",
    "COMPUTERS",
    "AIR_CONDITIONING",
    "CHEMISTRY_EQUIPMENT",
    "3D_PRINTER",
    "WHITEBOARD",
  ];
  for (const code of featureCodes) {
    await prisma.roomFeatureDefinition.upsert({
      where: { id: uuid(`feat:${code}`) },
      update: {},
      create: { id: uuid(`feat:${code}`), tenantId, code, name: code, dataType: "boolean" },
    });
  }

  /**
   * Features a room actually has, by room type.
   *
   * The prototype gave every one of the 24 rooms a single `PROJECTOR=true` row,
   * so a required-feature constraint either matched everything or nothing and
   * the Facility Engine had no discriminating signal at all. These sets are
   * what a school of this kind would really have.
   */
  const FEATURES_BY_ROOM_TYPE: Record<string, string[]> = {
    CLASSROOM: ["PROJECTOR", "WHITEBOARD"],
    MUSIC_ROOM: ["PIANO", "SOUND_SYSTEM", "AIR_CONDITIONING"],
    COMPUTER_LAB: ["COMPUTERS", "PROJECTOR", "AIR_CONDITIONING", "WHITEBOARD"],
    SCIENCE_LAB: ["CHEMISTRY_EQUIPMENT", "WHITEBOARD", "PROJECTOR"],
    AUDITORIUM: ["SOUND_SYSTEM", "PROJECTOR", "AIR_CONDITIONING"],
    MEETING_ROOM: ["PROJECTOR", "AIR_CONDITIONING", "WHITEBOARD"],
  };

  for (let i = 1; i <= 24; i++) {
    const type = typeCodes[i % typeCodes.length]![0];
    const id = uuid(`room:${i}`);
    await prisma.room.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        code: `R${String(i).padStart(2, "0")}`,
        name: `Phòng ${i}`,
        roomTypeId: uuid(`rtype:${type}`),
        building: i % 2 === 0 ? "STEM" : "A",
        floor: String((i % 3) + 1),
        capacity: 20 + (i % 6) * 15,
        status: "ACTIVE",
      },
    });

    const features = [...FEATURES_BY_ROOM_TYPE[type]!];
    // A handful of rooms carry the school's scarce equipment. Scarcity is the
    // point: a request that needs a 3D printer must have somewhere to land and
    // somewhere to be rejected from.
    if (type === "SCIENCE_LAB" && i % 8 === 3) features.push("3D_PRINTER");
    if (type === "CLASSROOM" && i % 12 === 0) features.push("AIR_CONDITIONING");

    for (const code of features) {
      await prisma.roomFeatureValue.upsert({
        where: { roomId_featureId: { roomId: id, featureId: uuid(`feat:${code}`) } },
        update: { value: "true" },
        create: {
          id: uuid(`rf:${i}:${code}`),
          roomId: id,
          featureId: uuid(`feat:${code}`),
          value: "true",
        },
      });
    }
  }

  async function upsertPerson(opts: {
    code: string;
    name: string;
    memberType: "STUDENT" | "TEACHER" | "STAFF";
    status: "ACTIVE" | "GRADUATED";
    roles: Array<"STUDENT" | "TEACHER" | "MENTOR" | "SCHOOL_ADMIN" | "ADMIN_IT">;
    classId?: string;
    /** Omit to leave the column NULL, which means "never recorded". */
    dateOfBirth?: Date;
    gender?: DemoGender;
  }) {
    const userId = uuid(`user:${opts.code}`);
    const identity = {
      fullName: opts.name,
      dateOfBirth: opts.dateOfBirth ?? null,
      gender: opts.gender ?? null,
    };
    await prisma.user.upsert({
      where: { id: userId },
      // Identity is re-applied on update so `db:demo:reset` is idempotent even
      // against a database seeded by an older revision of this file.
      update: { passwordHash: hash, mustChangePassword: true, ...identity },
      create: {
        id: userId,
        tenantId,
        passwordHash: hash,
        mustChangePassword: true,
        ...identity,
      },
    });
    await prisma.schoolMembership.upsert({
      where: { tenantId_schoolMemberCode: { tenantId, schoolMemberCode: opts.code } },
      update: {},
      create: {
        id: uuid(`mem:${opts.code}`),
        tenantId,
        userId,
        schoolMemberCode: opts.code,
        memberType: opts.memberType,
        membershipStatus: opts.status,
        classId: opts.classId,
        startedAt: new Date("2024-08-15"),
      },
    });
    for (const role of opts.roles) {
      await prisma.userRoleAssignment.upsert({
        where: { userId_role: { userId, role } },
        update: {},
        create: { id: uuid(`role:${opts.code}:${role}`), userId, role, assignedBy: "seed" },
      });
    }
    return userId;
  }

  await upsertPerson({
    code: "IT000001",
    name: "Admin IT Demo",
    memberType: "STAFF",
    status: "ACTIVE",
    roles: ["ADMIN_IT"],
    dateOfBirth: demoDateOfBirth("IT000001", 1982, 1992),
    gender: "MALE",
  });
  await upsertPerson({
    code: "AD000001",
    name: "Hiệu phó Minh",
    memberType: "STAFF",
    status: "ACTIVE",
    roles: ["SCHOOL_ADMIN"],
    dateOfBirth: demoDateOfBirth("AD000001", 1970, 1980),
    gender: "MALE",
  });
  const teacherId = await upsertPerson({
    code: "GV000001",
    name: "Cô Lan",
    memberType: "TEACHER",
    status: "ACTIVE",
    roles: ["TEACHER"],
    dateOfBirth: demoDateOfBirth("GV000001", 1980, 1990),
    gender: "FEMALE",
  });
  const studentId = await upsertPerson({
    code: "HS000001",
    name: "Nguyễn An",
    memberType: "STUDENT",
    status: "ACTIVE",
    roles: ["STUDENT"],
    classId: classIds[0],
    dateOfBirth: demoDateOfBirth("HS000001", 2009, 2011),
    gender: "MALE",
  });
  await upsertPerson({
    code: "HS990001",
    name: "Trần Tốt Nghiệp",
    memberType: "STUDENT",
    status: "GRADUATED",
    roles: ["STUDENT"],
    dateOfBirth: demoDateOfBirth("HS990001", 2005, 2007),
    gender: "MALE",
  });
  const president = await upsertPerson({
    code: "HS000010",
    name: "Phạm Chủ Nhiệm",
    memberType: "STUDENT",
    status: "ACTIVE",
    roles: ["STUDENT"],
    classId: classIds[0],
    dateOfBirth: demoDateOfBirth("HS000010", 2009, 2011),
    gender: "FEMALE",
  });

  const BULK_GENDERS: DemoGender[] = ["FEMALE", "MALE", "OTHER", "UNDISCLOSED"];
  /** Deterministic gender for a bulk demo identity. */
  function bulkGender(code: string): DemoGender {
    // 0–1 dominate so OTHER/UNDISCLOSED stay a realistic minority, and every
    // value still appears in the dataset.
    const roll = pick(`gender:${code}`, 0, 19);
    if (roll < 9) return BULK_GENDERS[0]!;
    if (roll < 18) return BULK_GENDERS[1]!;
    return BULK_GENDERS[roll === 18 ? 2 : 3]!;
  }

  for (let i = 2; i <= 24; i++) {
    const code = `GV${String(i).padStart(6, "0")}`;
    await upsertPerson({
      code,
      name: `Giáo viên ${i}`,
      memberType: "TEACHER",
      status: "ACTIVE",
      roles: ["TEACHER"],
      dateOfBirth: demoDateOfBirth(code, 1975, 1995),
      gender: bulkGender(code),
    });
  }

  // Teacher routing data is deliberately explicit. The routing layer is not an
  // "AI engine": it classifies a student need into a responsibility, filters
  // eligible teachers, then ranks by workload/office-hour availability.
  const TEACHER_RESPONSIBILITY_ROTATION = [
    ["ACADEMIC", "COMPETITION"],
    ["DOCUMENTS", "ADMINISTRATION"],
    ["WELLBEING", "COUNSELLING"],
    ["SCHOLARSHIP", "STUDY_ABROAD"],
    ["EXTRACURRICULAR", "CLUBS"],
    ["CAREER", "UNIVERSITY"],
  ] as const;
  const TEACHER_OFFICE_HOURS = [
    ["MON_15_30", "WED_15_30"],
    ["TUE_16_00", "THU_16_00"],
    ["MON_16_30", "FRI_15_30"],
    ["WED_16_00", "FRI_16_00"],
  ] as const;
  for (let i = 1; i <= 24; i++) {
    const code = `GV${String(i).padStart(6, "0")}`;
    const userId = uuid(`user:${code}`);
    const profileId = uuid(`teacher-profile:${code}`);
    const responsibilities = [
      ...TEACHER_RESPONSIBILITY_ROTATION[(i - 1) % TEACHER_RESPONSIBILITY_ROTATION.length]!,
    ];
    const officeHours = [...TEACHER_OFFICE_HOURS[(i - 1) % TEACHER_OFFICE_HOURS.length]!];
    await prisma.teacherProfile.upsert({
      where: { userId },
      update: { responsibilities, officeHours },
      create: {
        id: profileId,
        tenantId,
        userId,
        responsibilities,
        officeHours,
        bio: `Phụ trách ${responsibilities.join(", ").toLowerCase()} cho học sinh ED4U.`,
      },
    });
  }
  await prisma.teacherBlock.upsert({
    where: { id: uuid("teacher-block:GV000001:demo") },
    update: {},
    create: {
      id: uuid("teacher-block:GV000001:demo"),
      teacherProfileId: uuid("teacher-profile:GV000001"),
      startAt: nextDemoSchoolWeekdayAt(seedNow, 15, 0),
      endAt: nextDemoSchoolWeekdayAt(seedNow, 17, 0),
      reason: "Họp chuyên môn",
    },
  });
  for (let i = 2; i <= 120; i++) {
    if (i === 10) continue;
    const code = `HS${String(i).padStart(6, "0")}`;
    await upsertPerson({
      code,
      name: `Học sinh ${i}`,
      memberType: "STUDENT",
      status: "ACTIVE",
      roles: ["STUDENT"],
      classId: classIds[i % classIds.length],
      dateOfBirth: demoDateOfBirth(code, 2008, 2011),
      gender: bulkGender(code),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mentors                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * The demo mentor roster.
   *
   * This is written out longhand rather than generated because the Mentor
   * Intelligence Engine is only interesting against data that actually differs:
   * the prototype's 24 identical rows made every ranking a tie and every
   * explanation vacuous. The spread here is deliberate along the axes the
   * engine reasons about — domain, expertise, availability, price, verification,
   * experience, rating and, most importantly, credential *knowledge state*.
   *
   * `credentialsCheckedDomains` carries the three-valued contract into storage:
   *   domain listed + scores  -> KNOWN PRESENT
   *   domain listed, no score -> KNOWN ABSENT (mentor holds no such certificate)
   *   domain not listed       -> UNKNOWN (nobody ever checked)
   * All three appear below on purpose, so the adapter and the engine's
   * missing-data handling are exercised by the demo itself.
   */
  interface MentorSpec {
    code: string;
    name: string;
    gender: DemoGender;
    birthYear: number;
    headline: string;
    school: string;
    bio: string;
    expertise: string[];
    availability: string[];
    pricePerHour: number;
    verified: boolean;
    credentialsCheckedDomains: string[];
    ielts?: {
      overall: number;
      listening?: number;
      reading?: number;
      writing?: number;
      speaking?: number;
    };
    sat?: { total: number; math?: number; readingWriting?: number };
    hsk?: { level: number };
    teachingExperienceMonths?: number;
    sessionsCompleted?: number;
    rating?: number;
    ratingCount?: number;
    teachingStyles: string[];
    languages: string[];
    achievements?: string[];
  }

  const MENTORS: MentorSpec[] = [
    // ---- IELTS -------------------------------------------------------
    {
      code: "HS990002",
      name: "Nguyễn Thu Hà",
      gender: "FEMALE",
      birthYear: 2003,
      headline: "IELTS 8.5 · Writing & Speaking",
      school: "ĐH Ngoại thương",
      bio: "Luyện Writing Task 2 theo khung lập luận, chữa bài chi tiết từng câu.",
      expertise: ["IELTS.WRITING", "IELTS.SPEAKING"],
      availability: ["TUE_19_00", "THU_19_00", "SAT_09_00"],
      pricePerHour: 420_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS"],
      // Sections imply the overall exactly: (8.5+9+7.5+8)/4 = 8.25 -> 8.5.
      ielts: { overall: 8.5, listening: 8.5, reading: 9, writing: 7.5, speaking: 8 },
      teachingExperienceMonths: 30,
      sessionsCompleted: 260,
      rating: 4.8,
      ratingCount: 96,
      teachingStyles: ["STRUCTURED", "EXAM_FOCUSED"],
      languages: ["VI", "EN"],
      achievements: ["Thủ khoa khối D1 năm 2021"],
    },
    {
      code: "HS990003",
      name: "Trần Minh Khôi",
      gender: "MALE",
      birthYear: 2002,
      headline: "IELTS 7.5 · Reading & Listening",
      school: "ĐH Bách khoa Hà Nội",
      bio: "Tập trung kỹ thuật scan/skim và bẫy paraphrase.",
      expertise: ["IELTS.READING", "IELTS.LISTENING"],
      availability: ["MON_18_00", "WED_18_00"],
      pricePerHour: 260_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS"],
      // Overall only: this profile never published section bands.
      ielts: { overall: 7.5 },
      teachingExperienceMonths: 18,
      sessionsCompleted: 120,
      rating: 4.5,
      ratingCount: 40,
      teachingStyles: ["PATIENT", "ANALYTICAL"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990004",
      name: "Lê Bảo Ngọc",
      gender: "FEMALE",
      birthYear: 2004,
      headline: "IELTS 7.0 · Writing cơ bản",
      school: "ĐH Hà Nội",
      bio: "Đồng hành với bạn mới bắt đầu, sửa lỗi ngữ pháp nền tảng.",
      expertise: ["IELTS.WRITING"],
      availability: ["SAT_14_00", "SUN_14_00"],
      pricePerHour: 180_000,
      verified: false,
      credentialsCheckedDomains: ["IELTS"],
      ielts: { overall: 7, listening: 7, reading: 7.5, writing: 6.5, speaking: 7 },
      teachingExperienceMonths: 6,
      sessionsCompleted: 22,
      // No rating: too few sessions to have one. Absent, not zero.
      teachingStyles: ["CONVERSATIONAL", "MOTIVATING"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990005",
      name: "Phạm Quốc Anh",
      gender: "MALE",
      birthYear: 2001,
      headline: "IELTS 8.0 · Luyện thi cấp tốc",
      school: "ĐH Kinh tế Quốc dân",
      bio: "Lộ trình 8 tuần, ép tiến độ, phù hợp bạn đã có nền 6.0+.",
      expertise: ["IELTS.SPEAKING", "IELTS.WRITING", "IELTS.READING"],
      availability: ["TUE_20_00", "THU_20_00", "FRI_19_00"],
      pricePerHour: 520_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS"],
      ielts: { overall: 8, listening: 8, reading: 8.5, writing: 7, speaking: 7.5 },
      teachingExperienceMonths: 48,
      sessionsCompleted: 410,
      rating: 4.9,
      ratingCount: 151,
      teachingStyles: ["INTENSIVE", "EXAM_FOCUSED"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990006",
      name: "Hoàng Diệu Linh",
      gender: "FEMALE",
      birthYear: 2005,
      headline: "IELTS 6.5 · Listening",
      school: "ĐH Sư phạm Hà Nội",
      bio: "Nghe chép chính tả theo chủ đề, tốc độ tăng dần.",
      expertise: ["IELTS.LISTENING"],
      availability: ["MON_19_30", "WED_19_30"],
      pricePerHour: 150_000,
      verified: false,
      credentialsCheckedDomains: ["IELTS"],
      ielts: { overall: 6.5, listening: 6.5, reading: 6, writing: 6, speaking: 6.5 },
      teachingExperienceMonths: 4,
      sessionsCompleted: 9,
      teachingStyles: ["PATIENT", "FLEXIBLE"],
      languages: ["VI"],
    },
    {
      code: "HS990007",
      name: "Vũ Đình Nam",
      gender: "MALE",
      birthYear: 2000,
      headline: "IELTS 7.5 · Writing & Reading",
      school: "ĐH Ngoại ngữ – ĐHQGHN",
      bio: "Phân tích đề theo dạng, xây dàn ý trước khi viết.",
      expertise: ["IELTS.WRITING", "IELTS.READING"],
      availability: ["WED_17_00", "FRI_17_00"],
      pricePerHour: 300_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS"],
      ielts: { overall: 7.5 },
      teachingExperienceMonths: 24,
      sessionsCompleted: 180,
      rating: 4.6,
      ratingCount: 61,
      teachingStyles: ["ANALYTICAL", "STRUCTURED"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990008",
      name: "Đặng Khánh Vy",
      gender: "FEMALE",
      birthYear: 2003,
      headline: "IELTS 8.0 · Speaking",
      school: "Học viện Ngoại giao",
      bio: "Luyện phản xạ theo chủ đề Part 2–3, sửa phát âm từng buổi.",
      expertise: ["IELTS.SPEAKING"],
      availability: ["TUE_18_30", "THU_18_30", "SUN_10_00"],
      pricePerHour: 380_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS"],
      ielts: { overall: 8 },
      teachingExperienceMonths: 22,
      sessionsCompleted: 205,
      rating: 4.7,
      ratingCount: 88,
      teachingStyles: ["CONVERSATIONAL", "MOTIVATING"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990009",
      name: "Bùi Tuấn Kiệt",
      gender: "MALE",
      birthYear: 2002,
      headline: "Gia sư IELTS Writing",
      school: "ĐH Công nghệ – ĐHQGHN",
      bio: "Hồ sơ mới, chưa gửi chứng chỉ để trường xác minh.",
      expertise: ["IELTS.WRITING"],
      availability: ["MON_20_00"],
      pricePerHour: 200_000,
      verified: false,
      // UNKNOWN: nobody has checked any credential for this mentor. The adapter
      // must omit the keys entirely — absence of a check is not absence of a
      // certificate.
      credentialsCheckedDomains: [],
      teachingStyles: ["FLEXIBLE"],
      languages: ["VI"],
    },
    {
      code: "HS990010",
      name: "Đỗ Phương Thảo",
      gender: "FEMALE",
      birthYear: 2004,
      headline: "Kèm nền tảng IELTS · chưa có chứng chỉ",
      school: "ĐH Thương mại",
      bio: "Hỗ trợ bạn mất gốc lấy lại nền, không nhận lớp luyện thi gấp.",
      expertise: ["IELTS.LISTENING", "IELTS.READING"],
      availability: ["SAT_08_00", "SAT_10_00"],
      pricePerHour: 130_000,
      verified: false,
      // KNOWN ABSENT: the school checked and this mentor holds no IELTS
      // certificate. A `minCredentialScore` constraint must reject her
      // deterministically — which is different from being unrankable.
      credentialsCheckedDomains: ["IELTS"],
      teachingExperienceMonths: 8,
      sessionsCompleted: 30,
      rating: 4.2,
      ratingCount: 11,
      teachingStyles: ["PATIENT"],
      languages: ["VI"],
    },
    {
      code: "HS990011",
      name: "Ngô Gia Bảo",
      gender: "MALE",
      birthYear: 1999,
      headline: "IELTS 9.0 · Toàn kỹ năng",
      school: "ĐH Ngoại thương",
      bio: "Nhận lớp 1-1 cho mục tiêu 8.0+, lịch kín, ưu tiên cam kết dài hạn.",
      expertise: ["IELTS.WRITING", "IELTS.SPEAKING", "IELTS.READING", "IELTS.LISTENING"],
      availability: ["MON_19_00", "TUE_19_00", "WED_19_00", "THU_19_00"],
      pricePerHour: 650_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS"],
      ielts: { overall: 9 },
      teachingExperienceMonths: 72,
      sessionsCompleted: 800,
      rating: 4.9,
      ratingCount: 300,
      teachingStyles: ["EXAM_FOCUSED", "INTENSIVE", "ANALYTICAL"],
      languages: ["VI", "EN"],
      achievements: ["Giải Nhất HSG Quốc gia môn Tiếng Anh", "IELTS 9.0 overall"],
    },

    // ---- SAT ---------------------------------------------------------
    {
      code: "HS990012",
      name: "Dương Hải Yến",
      gender: "FEMALE",
      birthYear: 2002,
      headline: "SAT 1520 · Math & RW",
      school: "VinUniversity",
      bio: "Dạy full-test theo timing thật, phân tích lỗi sau mỗi lần thi thử.",
      expertise: ["SAT.MATH", "SAT.READING_WRITING"],
      availability: ["TUE_19_00", "THU_19_00"],
      pricePerHour: 480_000,
      verified: true,
      credentialsCheckedDomains: ["SAT"],
      sat: { total: 1520, math: 780, readingWriting: 740 },
      teachingExperienceMonths: 30,
      sessionsCompleted: 210,
      rating: 4.8,
      ratingCount: 77,
      teachingStyles: ["STRUCTURED", "EXAM_FOCUSED"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990013",
      name: "Lý Trọng Nhân",
      gender: "MALE",
      birthYear: 2003,
      headline: "SAT 1420 · Math",
      school: "ĐH Bách khoa TP.HCM",
      bio: "Chuyên phần Math, luyện bẫy đề và kỹ thuật loại đáp án.",
      expertise: ["SAT.MATH"],
      availability: ["MON_18_00", "WED_18_00", "FRI_18_00"],
      pricePerHour: 320_000,
      verified: true,
      credentialsCheckedDomains: ["SAT"],
      sat: { total: 1420, math: 750, readingWriting: 670 },
      teachingExperienceMonths: 16,
      sessionsCompleted: 95,
      rating: 4.5,
      ratingCount: 33,
      teachingStyles: ["ANALYTICAL"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990014",
      name: "Mai Thanh Trúc",
      gender: "FEMALE",
      birthYear: 2004,
      headline: "SAT 1480 · Reading & Writing",
      school: "ĐH Fulbright Việt Nam",
      bio: "Đọc hiểu theo cấu trúc lập luận, mở rộng vốn từ học thuật.",
      expertise: ["SAT.READING_WRITING"],
      availability: ["SAT_09_00", "SUN_09_00"],
      pricePerHour: 350_000,
      verified: true,
      credentialsCheckedDomains: ["SAT"],
      // Total only: sections were never published.
      sat: { total: 1480 },
      teachingExperienceMonths: 12,
      sessionsCompleted: 60,
      rating: 4.4,
      ratingCount: 25,
      teachingStyles: ["PATIENT", "MOTIVATING"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990015",
      name: "Trịnh Đức Duy",
      gender: "MALE",
      birthYear: 2001,
      headline: "SAT 1350 · Math & RW",
      school: "ĐH Kinh tế TP.HCM",
      bio: "Lịch linh hoạt, nhận kèm nhóm nhỏ 2–3 bạn.",
      expertise: ["SAT.MATH", "SAT.READING_WRITING"],
      availability: ["WED_20_00", "FRI_20_00"],
      pricePerHour: 240_000,
      verified: false,
      credentialsCheckedDomains: ["SAT"],
      sat: { total: 1350, math: 700, readingWriting: 650 },
      teachingExperienceMonths: 20,
      sessionsCompleted: 110,
      rating: 4.3,
      ratingCount: 40,
      teachingStyles: ["FLEXIBLE", "CONVERSATIONAL"],
      languages: ["VI"],
    },
    {
      code: "HS990016",
      name: "Cao Nhật Minh",
      gender: "MALE",
      birthYear: 2000,
      headline: "SAT 1290 · Math nền tảng",
      school: "ĐH Cần Thơ",
      bio: "Ôn lại đại số và hình học trước khi vào đề thật.",
      expertise: ["SAT.MATH"],
      availability: ["TUE_17_00", "THU_17_00"],
      pricePerHour: 180_000,
      verified: false,
      credentialsCheckedDomains: ["SAT"],
      sat: { total: 1290 },
      teachingExperienceMonths: 10,
      sessionsCompleted: 44,
      rating: 4,
      ratingCount: 18,
      teachingStyles: ["PATIENT"],
      languages: ["VI"],
    },
    {
      code: "HS990017",
      name: "Hồ Lan Chi",
      gender: "FEMALE",
      birthYear: 2003,
      headline: "Kèm SAT RW · chưa có điểm chính thức",
      school: "ĐH Sư phạm TP.HCM",
      bio: "Hỗ trợ đọc hiểu và ngữ pháp, chưa dự thi SAT chính thức.",
      expertise: ["SAT.READING_WRITING"],
      availability: ["SUN_15_00"],
      pricePerHour: 160_000,
      verified: false,
      // KNOWN ABSENT for SAT.
      credentialsCheckedDomains: ["SAT"],
      teachingExperienceMonths: 5,
      sessionsCompleted: 12,
      teachingStyles: ["MOTIVATING"],
      languages: ["VI"],
    },
    {
      code: "HS990018",
      name: "Phan Việt Hùng",
      gender: "MALE",
      birthYear: 1998,
      headline: "SAT 1560 · Luyện thi học bổng",
      school: "ĐH Quốc gia Singapore",
      bio: "Đồng hành hồ sơ du học, đặt mục tiêu 1500+.",
      expertise: ["SAT.MATH", "SAT.READING_WRITING"],
      availability: ["MON_20_30", "WED_20_30", "SAT_16_00"],
      pricePerHour: 600_000,
      verified: true,
      credentialsCheckedDomains: ["SAT"],
      sat: { total: 1560, math: 800, readingWriting: 760 },
      teachingExperienceMonths: 60,
      sessionsCompleted: 520,
      rating: 4.9,
      ratingCount: 190,
      teachingStyles: ["INTENSIVE", "EXAM_FOCUSED"],
      languages: ["VI", "EN"],
      achievements: ["Học bổng toàn phần NUS"],
    },

    // ---- HSK ---------------------------------------------------------
    {
      code: "HS990019",
      name: "Tạ Bích Ngọc",
      gender: "FEMALE",
      birthYear: 2002,
      headline: "HSK 6 · Đọc, Viết, Nghe",
      school: "ĐH Ngoại ngữ – ĐHQGHN",
      bio: "Luyện đề HSK 5–6, chú trọng từ vựng học thuật.",
      expertise: ["HSK.READING", "HSK.WRITING", "HSK.LISTENING"],
      availability: ["TUE_18_00", "THU_18_00"],
      pricePerHour: 300_000,
      verified: true,
      credentialsCheckedDomains: ["HSK"],
      hsk: { level: 6 },
      teachingExperienceMonths: 28,
      sessionsCompleted: 175,
      rating: 4.7,
      ratingCount: 64,
      teachingStyles: ["STRUCTURED"],
      languages: ["VI", "ZH"],
    },
    {
      code: "HS990020",
      name: "Chu Hoàng Long",
      gender: "MALE",
      birthYear: 2003,
      headline: "HSK 5 · Nghe hiểu",
      school: "ĐH Hà Nội",
      bio: "Nghe hội thoại đời sống, luyện phản xạ nghe – nói.",
      expertise: ["HSK.LISTENING"],
      availability: ["MON_19_00", "WED_19_00"],
      pricePerHour: 220_000,
      verified: true,
      credentialsCheckedDomains: ["HSK"],
      hsk: { level: 5 },
      teachingExperienceMonths: 14,
      sessionsCompleted: 80,
      rating: 4.5,
      ratingCount: 29,
      teachingStyles: ["PATIENT", "CONVERSATIONAL"],
      languages: ["VI", "ZH"],
    },
    {
      code: "HS990021",
      name: "Đinh Mỹ Duyên",
      gender: "FEMALE",
      birthYear: 2005,
      headline: "HSK 4 · Viết chữ Hán",
      school: "ĐH Thăng Long",
      bio: "Kèm viết chữ và ngữ pháp cơ bản cho người mới.",
      expertise: ["HSK.WRITING"],
      availability: ["SAT_13_00", "SUN_13_00"],
      pricePerHour: 140_000,
      verified: false,
      credentialsCheckedDomains: ["HSK"],
      hsk: { level: 4 },
      teachingExperienceMonths: 6,
      sessionsCompleted: 18,
      rating: 4.1,
      ratingCount: 7,
      teachingStyles: ["FLEXIBLE"],
      languages: ["VI", "ZH"],
    },
    {
      code: "HS990022",
      name: "Lâm Chí Kiên",
      gender: "MALE",
      birthYear: 2001,
      headline: "Kèm HSK đọc hiểu · chưa thi chứng chỉ",
      school: "ĐH Mở TP.HCM",
      bio: "Sống ở Đài Loan 3 năm, chưa dự kỳ thi HSK chính thức.",
      expertise: ["HSK.READING"],
      availability: ["FRI_19_30"],
      pricePerHour: 120_000,
      verified: false,
      // KNOWN ABSENT for HSK.
      credentialsCheckedDomains: ["HSK"],
      teachingStyles: ["MOTIVATING"],
      languages: ["VI", "ZH"],
    },
    {
      code: "HS990023",
      name: "Nguyễn Hồng Nhung",
      gender: "FEMALE",
      birthYear: 2000,
      headline: "HSK 6 + IELTS 7.0 · Song ngữ",
      school: "ĐH Ngoại thương",
      bio: "Nhận cả lớp HSK và IELTS Reading, ưu tiên bạn học song song.",
      expertise: ["HSK.READING", "HSK.WRITING", "IELTS.READING"],
      availability: ["TUE_20_00", "THU_20_00", "SUN_16_00"],
      pricePerHour: 400_000,
      verified: true,
      credentialsCheckedDomains: ["HSK", "IELTS"],
      hsk: { level: 6 },
      ielts: { overall: 7 },
      teachingExperienceMonths: 36,
      sessionsCompleted: 240,
      rating: 4.8,
      ratingCount: 102,
      teachingStyles: ["ANALYTICAL", "STRUCTURED"],
      languages: ["VI", "EN", "ZH"],
    },

    // ---- Cross-domain ------------------------------------------------
    {
      code: "HS990024",
      name: "Trương Anh Tuấn",
      gender: "MALE",
      birthYear: 1999,
      headline: "IELTS 7.5 + SAT 1440 · Hồ sơ du học",
      school: "ĐH Ngoại thương",
      bio: "Kết hợp luyện Writing và SAT RW cho bộ hồ sơ du học Mỹ.",
      expertise: ["IELTS.WRITING", "SAT.READING_WRITING"],
      availability: ["MON_17_30", "WED_17_30"],
      pricePerHour: 450_000,
      verified: true,
      credentialsCheckedDomains: ["IELTS", "SAT"],
      ielts: { overall: 7.5 },
      sat: { total: 1440, math: 740, readingWriting: 700 },
      teachingExperienceMonths: 40,
      sessionsCompleted: 300,
      rating: 4.7,
      ratingCount: 120,
      teachingStyles: ["EXAM_FOCUSED", "ANALYTICAL"],
      languages: ["VI", "EN"],
    },
    {
      code: "HS990025",
      name: "Vương Kim Ngân",
      gender: "UNDISCLOSED",
      birthYear: 2004,
      headline: "IELTS 6.5 · Speaking cho người mới",
      school: "ĐH Văn Lang",
      bio: "Trường đã xác minh: có IELTS, không có SAT và HSK.",
      expertise: ["IELTS.SPEAKING"],
      availability: ["SUN_19_00"],
      pricePerHour: 170_000,
      verified: false,
      // All three domains checked. IELTS is PRESENT; SAT and HSK are KNOWN
      // ABSENT. One row that exercises every credential state at once.
      credentialsCheckedDomains: ["IELTS", "SAT", "HSK"],
      ielts: { overall: 6.5 },
      teachingExperienceMonths: 7,
      sessionsCompleted: 25,
      rating: 4,
      ratingCount: 9,
      teachingStyles: ["CONVERSATIONAL"],
      languages: ["VI"],
    },
  ];

  for (const spec of MENTORS) {
    const userId = await upsertPerson({
      code: spec.code,
      name: spec.name,
      memberType: "STUDENT",
      status: "GRADUATED",
      roles: ["MENTOR"],
      dateOfBirth: demoDateOfBirth(spec.code, spec.birthYear, spec.birthYear),
      gender: spec.gender,
    });
    const data = {
      tenantId,
      userId,
      verified: spec.verified,
      headline: spec.headline,
      school: spec.school,
      bio: spec.bio,
      expertise: spec.expertise,
      availability: spec.availability,
      pricePerHour: spec.pricePerHour,
      // Vietnamese students finish upper secondary at 18.
      graduationYear: spec.birthYear + 18,
      credentialsCheckedDomains: spec.credentialsCheckedDomains,
      ieltsOverall: spec.ielts?.overall ?? null,
      ieltsListening: spec.ielts?.listening ?? null,
      ieltsReading: spec.ielts?.reading ?? null,
      ieltsWriting: spec.ielts?.writing ?? null,
      ieltsSpeaking: spec.ielts?.speaking ?? null,
      satTotal: spec.sat?.total ?? null,
      satMath: spec.sat?.math ?? null,
      satReadingWriting: spec.sat?.readingWriting ?? null,
      hskLevel: spec.hsk?.level ?? null,
      teachingExperienceMonths: spec.teachingExperienceMonths ?? null,
      sessionsCompleted: spec.sessionsCompleted ?? null,
      rating: spec.rating ?? null,
      ratingCount: spec.ratingCount ?? null,
      teachingStyles: spec.teachingStyles,
      languages: spec.languages,
      achievements: spec.achievements ?? [],
    };
    await prisma.mentorProfile.upsert({
      where: { id: uuid(`mp:${spec.code}`) },
      update: data,
      create: { id: uuid(`mp:${spec.code}`), ...data },
    });
  }

  // Graduated alumni who are not mentors, so "graduated" and "mentor" stay
  // visibly distinct in the demo.
  for (let i = 26; i <= 36; i++) {
    const code = `HS99${String(i).padStart(4, "0")}`;
    await upsertPerson({
      code,
      name: `Cựu học sinh ${i}`,
      memberType: "STUDENT",
      status: "GRADUATED",
      roles: ["STUDENT"],
      dateOfBirth: demoDateOfBirth(code, 2003, 2006),
      gender: bulkGender(code),
    });
  }

  const weekdays = ["MON", "TUE", "WED", "THU", "FRI"] as const;
  let entryN = 0;
  for (const classId of classIds) {
    for (const day of weekdays) {
      for (let p = 0; p < 4; p++) {
        entryN += 1;
        const periodCode = periodTimes[p]![0];
        const subject = subjects[p % subjects.length]![0];
        await prisma.timetableEntry.upsert({
          where: { id: uuid(`tt:${entryN}`) },
          update: {},
          create: {
            id: uuid(`tt:${entryN}`),
            tenantId,
            academicYearId: yearId,
            semesterId: semId,
            classId,
            subjectId: uuid(`subject:${subject}`),
            teacherId: uuid(`user:GV${String((entryN % 24) + 1).padStart(6, "0")}`),
            roomId: uuid(`room:${(entryN % 24) + 1}`),
            weekday: day,
            periodId: uuid(`period:${periodCode}`),
          },
        });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Facility demo state                                                */
  /* ------------------------------------------------------------------ */

  // The inherited prototype had feature-rich rooms but no live operational
  // state, so confirmed bookings, maintenance and soft holds could never bite.
  // These fixtures are all on the next school weekday and after P1–P4, which
  // keeps them useful for demos without contradicting the seeded timetable.
  const confirmedEventStart = nextDemoSchoolWeekdayAt(seedNow, 16, 0);
  const confirmedEventEnd = nextDemoSchoolWeekdayAt(seedNow, 18, 0);
  const confirmedRequestId = uuid("roomreq:fixture:confirmed");
  const confirmedRoomId = uuid("room:4"); // R04 · auditorium
  const confirmedRequestData = {
    tenantId,
    roomId: confirmedRoomId,
    requestedBy: president,
    status: "APPROVED" as const,
    eventStart: confirmedEventStart,
    eventEnd: confirmedEventEnd,
    setupMinutes: 15,
    cleanupMinutes: 15,
    holdCreatedAt: seedNow,
    recommendation: { fixture: "confirmed-demo-booking" },
  };
  await prisma.roomRequest.upsert({
    where: { id: confirmedRequestId },
    update: confirmedRequestData,
    create: { id: confirmedRequestId, ...confirmedRequestData },
  });
  const confirmedBookingData = {
    tenantId,
    roomId: confirmedRoomId,
    requestId: confirmedRequestId,
    // RoomBooking stores the occupied interval, including setup/cleanup.
    startAt: new Date(confirmedEventStart.getTime() - 15 * 60_000),
    endAt: new Date(confirmedEventEnd.getTime() + 15 * 60_000),
    cancelledAt: null,
  };
  await prisma.roomBooking.upsert({
    where: { requestId: confirmedRequestId },
    update: confirmedBookingData,
    create: { id: uuid("roombooking:fixture:confirmed"), ...confirmedBookingData },
  });

  const maintenanceBlockId = uuid("roomblock:fixture:maintenance");
  const maintenanceBlockData = {
    tenantId,
    roomId: uuid("room:9"), // R09 · science lab
    startAt: nextDemoSchoolWeekdayAt(seedNow, 13, 0),
    endAt: nextDemoSchoolWeekdayAt(seedNow, 17, 0),
    reason: "Bảo trì hệ thống thiết bị phòng thí nghiệm",
  };
  await prisma.roomBlock.upsert({
    where: { id: maintenanceBlockId },
    update: maintenanceBlockData,
    create: { id: maintenanceBlockId, ...maintenanceBlockData },
  });

  const pendingRequestId = uuid("roomreq:fixture:soft-hold");
  const pendingRequestData = {
    tenantId,
    roomId: uuid("room:16"), // R16 · auditorium
    requestedBy: president,
    status: "PENDING_APPROVAL" as const,
    eventStart: nextDemoSchoolWeekdayAt(seedNow, 16, 0),
    eventEnd: nextDemoSchoolWeekdayAt(seedNow, 18, 0),
    setupMinutes: 15,
    cleanupMinutes: 15,
    // Intentionally relative: it must remain an active (<24h) demo soft hold.
    holdCreatedAt: new Date(seedNow.getTime() - 2 * 60 * 60 * 1000),
    recommendation: { fixture: "active-soft-hold" },
  };
  await prisma.roomRequest.upsert({
    where: { id: pendingRequestId },
    update: pendingRequestData,
    create: { id: pendingRequestId, ...pendingRequestData },
  });

  const clubId = uuid("club:robotics");
  await prisma.club.upsert({
    where: { id: clubId },
    update: {},
    create: { id: clubId, tenantId, name: "CLB Robotics", status: "ACTIVE" },
  });
  await prisma.clubMembership.upsert({
    where: { id: uuid("cm:pres") },
    update: {},
    create: { id: uuid("cm:pres"), clubId, userId: president, role: "PRESIDENT", status: "ACTIVE" },
  });
  await prisma.financeEntry.upsert({
    where: { id: uuid("fin:1") },
    update: {},
    create: {
      id: uuid("fin:1"),
      clubId,
      kind: "INCOME",
      amount: 2_000_000,
      category: "Tài trợ",
      description: "Tài trợ STEM",
      status: "APPROVED",
      createdBy: president,
      approvedBy: president,
    },
  });
  await prisma.club.upsert({
    where: { id: uuid("club:music") },
    update: {},
    create: { id: uuid("club:music"), tenantId, name: "CLB Âm nhạc", status: "ACTIVE" },
  });
  await prisma.club.upsert({
    where: { id: uuid("club:debate") },
    update: {},
    create: { id: uuid("club:debate"), tenantId, name: "CLB Debate", status: "PROPOSED" },
  });

  await prisma.schoolEvent.upsert({
    where: { id: uuid("ev:open") },
    update: {},
    create: {
      id: uuid("ev:open"),
      tenantId,
      title: "Ngày hội STEM",
      startAt: new Date("2026-08-21T13:00:00Z"),
      endAt: new Date("2026-08-21T16:00:00Z"),
      visibility: "SCHOOL",
      priority: 10,
    },
  });

  await prisma.application.upsert({
    where: { id: uuid("app:1") },
    update: {},
    create: {
      id: uuid("app:1"),
      tenantId,
      studentId,
      rawRequestText: "Xin xác nhận tham gia kỳ thi học sinh giỏi Toán.",
      currentTeacherId: teacherId,
      status: "IN_REVIEW",
    },
  });
  await prisma.appointment.upsert({
    where: { id: uuid("apt:1") },
    update: {},
    create: {
      id: uuid("apt:1"),
      tenantId,
      studentId,
      teacherId,
      title: "Tư vấn học Toán",
      startAt: new Date("2026-08-18T15:00:00Z"),
      endAt: new Date("2026-08-18T15:30:00Z"),
      status: "REQUESTED",
    },
  });

  const catId = uuid("cat:general");
  await prisma.discussionCategory.upsert({
    where: { id: catId },
    update: {},
    create: { id: catId, tenantId, name: "Chung" },
  });
  const forumId = uuid("forum:school");
  await prisma.forum.upsert({
    where: { id: forumId },
    update: {},
    create: { id: forumId, categoryId: catId, name: "Diễn đàn trường" },
  });
  const threadId = uuid("th:welcome");
  await prisma.thread.upsert({
    where: { id: threadId },
    update: {},
    create: {
      id: threadId,
      forumId,
      title: "Chào mừng đến ED4U",
      type: "ANNOUNCEMENT",
      authorId: teacherId,
    },
  });
  await prisma.post.upsert({
    where: { id: uuid("post:1") },
    update: {},
    create: {
      id: uuid("post:1"),
      threadId,
      authorId: teacherId,
      body: "Đây là diễn đàn chính thức của ED4U Demo High School.",
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        id: uuid("n:1"),
        tenantId,
        userId: studentId,
        type: "MENTOR_MATCH",
        title: "Tìm mentor IELTS",
        body: "Mở Match Space để xem gợi ý.",
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seeded ED4U Demo High School");
  console.log("Demo credentials (temporary password TempPass1!, must change on first login):");
  console.log("  ADMIN_IT       IT000001");
  console.log("  SCHOOL_ADMIN   AD000001");
  console.log("  TEACHER        GV000001");
  console.log("  STUDENT        HS000001");
  console.log("  GRADUATED      HS990001");
  console.log("  MENTOR         HS990002");
  console.log("  CLUB PRESIDENT HS000010");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
