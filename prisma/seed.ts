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

async function main() {
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const tenantId = uuid("tenant:ed4u-demo");

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, slug: "ed4u-demo", name: "ED4U Demo High School" },
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
    await prisma.roomFeatureValue.upsert({
      where: { roomId_featureId: { roomId: id, featureId: uuid("feat:PROJECTOR") } },
      update: {},
      create: {
        id: uuid(`rf:${i}:proj`),
        roomId: id,
        featureId: uuid("feat:PROJECTOR"),
        value: "true",
      },
    });
  }

  async function upsertPerson(opts: {
    code: string;
    name: string;
    memberType: "STUDENT" | "TEACHER" | "STAFF";
    status: "ACTIVE" | "GRADUATED";
    roles: Array<"STUDENT" | "TEACHER" | "MENTOR" | "SCHOOL_ADMIN" | "ADMIN_IT">;
    classId?: string;
  }) {
    const userId = uuid(`user:${opts.code}`);
    await prisma.user.upsert({
      where: { id: userId },
      update: { passwordHash: hash, mustChangePassword: true },
      create: {
        id: userId,
        tenantId,
        fullName: opts.name,
        passwordHash: hash,
        mustChangePassword: true,
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
  });
  await upsertPerson({
    code: "AD000001",
    name: "Hiệu phó Minh",
    memberType: "STAFF",
    status: "ACTIVE",
    roles: ["SCHOOL_ADMIN"],
  });
  const teacherId = await upsertPerson({
    code: "GV000001",
    name: "Cô Lan",
    memberType: "TEACHER",
    status: "ACTIVE",
    roles: ["TEACHER"],
  });
  const studentId = await upsertPerson({
    code: "HS000001",
    name: "Nguyễn An",
    memberType: "STUDENT",
    status: "ACTIVE",
    roles: ["STUDENT"],
    classId: classIds[0],
  });
  await upsertPerson({
    code: "HS990001",
    name: "Trần Tốt Nghiệp",
    memberType: "STUDENT",
    status: "GRADUATED",
    roles: ["STUDENT"],
  });
  const mentorUser = await upsertPerson({
    code: "HS990002",
    name: "Lê Mentor",
    memberType: "STUDENT",
    status: "GRADUATED",
    roles: ["MENTOR"],
  });
  const president = await upsertPerson({
    code: "HS000010",
    name: "Phạm Chủ Nhiệm",
    memberType: "STUDENT",
    status: "ACTIVE",
    roles: ["STUDENT"],
    classId: classIds[0],
  });

  for (let i = 2; i <= 24; i++) {
    await upsertPerson({
      code: `GV${String(i).padStart(6, "0")}`,
      name: `Giáo viên ${i}`,
      memberType: "TEACHER",
      status: "ACTIVE",
      roles: ["TEACHER"],
    });
  }
  for (let i = 2; i <= 120; i++) {
    if (i === 10) continue;
    await upsertPerson({
      code: `HS${String(i).padStart(6, "0")}`,
      name: `Học sinh ${i}`,
      memberType: "STUDENT",
      status: "ACTIVE",
      roles: ["STUDENT"],
      classId: classIds[i % classIds.length],
    });
  }
  for (let i = 3; i <= 36; i++) {
    const code = `HS99${String(i).padStart(4, "0")}`;
    const uid = await upsertPerson({
      code,
      name: `Cựu học sinh ${i}`,
      memberType: "STUDENT",
      status: "GRADUATED",
      roles: i <= 26 ? ["MENTOR"] : ["STUDENT"],
    });
    if (i <= 26) {
      await prisma.mentorProfile.upsert({
        where: { id: uuid(`mp:${code}`) },
        update: {},
        create: {
          id: uuid(`mp:${code}`),
          tenantId,
          userId: uid,
          verified: true,
          headline: "IELTS 8.0 · Writing coach",
          expertise: ["IELTS.WRITING"],
          availability: ["TUE_19_00", "THU_19_00"],
          pricePerHour: 180_000 + i * 1000,
          graduationYear: 2024,
          skills: ["IELTS.WRITING", "IELTS.SPEAKING"],
        },
      });
    }
  }
  await prisma.mentorProfile.upsert({
    where: { id: uuid("mp:HS990002") },
    update: {},
    create: {
      id: uuid("mp:HS990002"),
      tenantId,
      userId: mentorUser,
      verified: true,
      headline: "IELTS 8.5 · Writing",
      expertise: ["IELTS.WRITING"],
      availability: ["TUE_19_00", "THU_19_00"],
      pricePerHour: 200_000,
      graduationYear: 2023,
      skills: ["IELTS.WRITING"],
    },
  });

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
