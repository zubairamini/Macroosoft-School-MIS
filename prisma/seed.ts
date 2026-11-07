// Synthetic Dari demonstration data for مکتب‌یار (MaktabYar).
// All names, numbers, and records are FICTIONAL demonstration data.
//
// Run with:  bunx tsx prisma/seed.ts   (or)   bun run db:seed

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";

const db = new PrismaClient();

const GRADE_NAMES = [
  "صنف اول", "صنف دوم", "صنف سوم", "صنف چهارم", "صنف پنجم", "صنف ششم",
  "صنف هفتم", "صنف هشتم", "صنف نهم", "صنف دهم", "صنف یازدهم", "صنف دوازدهم",
];

const SECTION_LABELS = ["الف", "ب", "ج"];

interface SeedStudent {
  firstName: string;
  fatherName: string;
  grandfatherName: string;
  gender: "male" | "female";
  birthDate: string; // ISO date-only
  birthPlace: string;
  grade: number;
  sectionIdx: number;
  guardians: Array<{
    fullName: string;
    relationship: string;
    phone: string;
    occupation?: string;
    isPrimary: boolean;
    portalAccess?: boolean;
  }>;
}

// Fictional students — synthetic Dari demo data.
const STUDENTS: SeedStudent[] = [
  {
    firstName: "احمد//رضا", fatherName: "محمد//نور", grandfatherName: "غلام//حضرت",
    gender: "male", birthDate: "2014-03-25", birthPlace: "کابل", grade: 5, sectionIdx: 0,
    guardians: [
      { fullName: "محمد//نور احمدی", relationship: "پدر", phone: "+93701234501", occupation: "معمار", isPrimary: true, portalAccess: true },
      { fullName: "مریم//خانم احمدی", relationship: "مادر", phone: "+93701234502", isPrimary: false },
    ],
  },
  {
    firstName: "فاطمه", fatherName: "عبدال//رحمن", grandfatherName: "سید//قاسم",
    gender: "female", birthDate: "2013-11-02", birthPlace: "کابل", grade: 6, sectionIdx: 1,
    guardians: [
      { fullName: "عبدال//رحمن رحیمی", relationship: "پدر", phone: "+93701234503", occupation: "معلم", isPrimary: true, portalAccess: true },
    ],
  },
  {
    firstName: "زهرا", fatherName: "حسین", grandfatherName: "علی//اکبر",
    gender: "female", birthDate: "2015-06-18", birthPlace: "کابل", grade: 4, sectionIdx: 0,
    guardians: [
      { fullName: "حسین یوسفی", relationship: "پدر", phone: "+93701234504", occupation: "تاجر", isPrimary: true, portalAccess: true },
      { fullName: "نبیت یوسفی", relationship: "مادر", phone: "+93701234505", isPrimary: false },
    ],
  },
  {
    firstName: "عمر", fatherName: "دوست//محمد", grandfatherName: "نظر//محمد",
    gender: "male", birthDate: "2012-01-30", birthPlace: "پروان", grade: 7, sectionIdx: 2,
    guardians: [
      { fullName: "دوست//محمد کریمی", relationship: "پدر", phone: "+93701234506", occupation: "کشاورز", isPrimary: true },
    ],
  },
  {
    firstName: "نرگس", fatherName: "شاه//محمد", grandfatherName: "میرزا//حسین",
    gender: "female", birthDate: "2014-09-12", birthPlace: "کابل", grade: 5, sectionIdx: 1,
    guardians: [
      { fullName: "شاه//محمد صافی", relationship: "پدر", phone: "+93701234507", occupation: "کارمند", isPrimary: true, portalAccess: true },
    ],
  },
  {
    firstName: "سمیع//الله", fatherName: "انعام//الله", grandfatherName: "فضل//احمد",
    gender: "male", birthDate: "2011-04-08", birthPlace: "لوگر", grade: 8, sectionIdx: 0,
    guardians: [
      { fullName: "انعام//الله نوری", relationship: "پدر", phone: "+93701234508", occupation: "خیاط", isPrimary: true },
    ],
  },
  {
    firstName: "شکیبا", fatherName: "رحمت//الله", grandfatherName: "نعمت//الله",
    gender: "female", birthDate: "2016-02-21", birthPlace: "کابل", grade: 3, sectionIdx: 0,
    guardians: [
      { fullName: "رحمت//الله حکیمی", relationship: "پدر", phone: "+93701234509", occupation: "راننده", isPrimary: true },
    ],
  },
  {
    firstName: "یاسر", fatherName: "بصیر//احمد", grandfatherName: "عبدال//واحد",
    gender: "male", birthDate: "2010-12-05", birthPlace: "کابل", grade: 9, sectionIdx: 1,
    guardians: [
      { fullName: "بصیر//احمد بشیری", relationship: "پدر", phone: "+93701234510", occupation: "مهندس", isPrimary: true, portalAccess: true },
    ],
  },
];

// Sibling pair sharing one guardian (demonstrates multi-child guardians).
const SIBLING_GUARDIAN = {
  fullName: "فضل//کریم زمردی",
  relationship: "پدر",
  phone: "+93701234520",
  occupation: "صحاف",
  isPrimary: true,
  portalAccess: true,
};

const SIBLINGS: SeedStudent[] = [
  {
    firstName: "مینا", fatherName: "فضل//کریم", grandfatherName: "نصرت//الله",
    gender: "female", birthDate: "2015-07-14", birthPlace: "کابل", grade: 4, sectionIdx: 1,
    guardians: [{ ...SIBLING_GUARDIAN }],
  },
  {
    firstName: "وحید", fatherName: "فضل//کریم", grandfatherName: "نصرت//الله",
    gender: "male", birthDate: "2013-03-03", birthPlace: "کابل", grade: 6, sectionIdx: 2,
    guardians: [{ ...SIBLING_GUARDIAN }],
  },
];

// Applications in various workflow states (demonstration of the funnel).
const APPLICATIONS = [
  {
    firstName: "هدیه", fatherName: "نجیب//الله", grandfatherName: "صمد",
    gender: "female" as const, birthDate: "2017-05-09", birthPlace: "کابل",
    grade: 2, phone: "+93701234531",
    guardian: { fullName: "نجیب//الله عظیمی", relationship: "پدر", phone: "+93701234531", isPrimary: true },
    status: "draft" as const,
  },
  {
    firstName: "الیم‌خان", fatherName: "دلاور", grandfatherName: "خوشحال",
    gender: "male" as const, birthDate: "2016-10-11", birthPlace: "کابل",
    grade: 3, phone: "+93701234532",
    guardian: { fullName: "دلاور خان", relationship: "پدر", phone: "+93701234532", isPrimary: true },
    status: "submitted" as const,
  },
  {
    firstName: "روشنک", fatherName: "فرهاد", grandfatherName: "ظفر",
    gender: "female" as const, birthDate: "2015-08-25", birthPlace: "کابل",
    grade: 4, phone: "+93701234533",
    guardian: { fullName: "فرهاد صدیقی", relationship: "پدر", phone: "+93701234533", isPrimary: true, portalAccess: true },
    status: "under_review" as const,
  },
  {
    firstName: "جواد", fatherName: "محمود", grandfatherName: "اسد//الله",
    gender: "male" as const, birthDate: "2012-07-19", birthPlace: "غزنی",
    grade: 7, phone: "+93701234534",
    guardian: { fullName: "محمود رحمانی", relationship: "پدر", phone: "+93701234534", isPrimary: true },
    status: "approved" as const,
  },
  {
    firstName: "آرزو", fatherName: "کمال//الدین", grandfatherName: "جمال",
    gender: "female" as const, birthDate: "2011-09-30", birthPlace: "کابل",
    grade: 8, phone: "+93701234535",
    guardian: { fullName: "کمال//الدین امینی", relationship: "پدر", phone: "+93701234535", isPrimary: true },
    status: "rejected" as const,
    note: "ظرفیت صنف هشتم در این سال تعلیمی تکمیل است؛ برای سال بعد ثبت‌النام شود.",
  },
];

// Phase-2 extra students so attendance rosters & gradebooks look real.
const P2_STUDENTS: SeedStudent[] = [
  {
    firstName: "مهدی", fatherName: "شریف", grandfatherName: "بهرام",
    gender: "male", birthDate: "2015-04-14", birthPlace: "کابل", grade: 4, sectionIdx: 0,
    guardians: [{ fullName: "شریف سلطانی", relationship: "پدر", phone: "+93701234541", occupation: "برق‌کار", isPrimary: true }],
  },
  {
    firstName: "سویا", fatherName: "طاهر", grandfatherName: "قربان",
    gender: "female", birthDate: "2015-09-03", birthPlace: "کابل", grade: 4, sectionIdx: 0,
    guardians: [{ fullName: "طاهر مهدوی", relationship: "پدر", phone: "+93701234542", occupation: "خانم خانه", isPrimary: true }],
  },
  {
    firstName: "ایلت", fatherName: "ناصر", grandfatherName: "شریف",
    gender: "female", birthDate: "2016-01-19", birthPlace: "کابل", grade: 4, sectionIdx: 0,
    guardians: [{ fullName: "ناصر رحیم", relationship: "پدر", phone: "+93701234543", occupation: "معلم", isPrimary: true }],
  },
  {
    firstName: "برهان", fatherName: "اله‌داد", grandfatherName: "میرزا",
    gender: "male", birthDate: "2014-06-30", birthPlace: "کابل", grade: 5, sectionIdx: 0,
    guardians: [{ fullName: "اله‌داد امین", relationship: "پدر", phone: "+93701234544", occupation: "تاجر", isPrimary: true }],
  },
  {
    firstName: "ذکیه", fatherName: "غلام‌حیدر", grandfatherName: "فوز",
    gender: "female", birthDate: "2014-11-11", birthPlace: "کابل", grade: 5, sectionIdx: 0,
    guardians: [{ fullName: "غلام‌حیدر فوزی", relationship: "پدر", phone: "+93701234545", occupation: "خیاط", isPrimary: true }],
  },
];

async function main() {
  console.log("🌱 Seeding synthetic Dari demonstration data…");

  // Clean slate (demo database only — production uses migrations).
  await db.$transaction([
    db.notification.deleteMany(),
    db.outboxEvent.deleteMany(),
    db.auditEvent.deleteMany(),
    db.grade.deleteMany(),
    db.assessment.deleteMany(),
    db.attendanceRecord.deleteMany(),
    db.attendanceSession.deleteMany(),
    db.timetableSlot.deleteMany(),
    db.teachingAssignment.deleteMany(),
    db.staffMember.deleteMany(),
    db.studentDocument.deleteMany(),
    db.enrollment.deleteMany(),
    db.studentGuardian.deleteMany(),
    db.student.deleteMany(),
    db.guardian.deleteMany(),
    db.application.deleteMany(),
    db.classSection.deleteMany(),
    db.term.deleteMany(),
    db.subject.deleteMany(),
    db.gradeLevel.deleteMany(),
    db.academicYear.deleteMany(),
    db.room.deleteMany(),
    db.shift.deleteMany(),
    db.userRole.deleteMany(),
    db.session.deleteMany(),
    db.loginAttempt.deleteMany(),
    db.user.deleteMany(),
    db.setting.deleteMany(),
    db.counter.deleteMany(),
    db.branch.deleteMany(),
    db.organization.deleteMany(),
  ]);

  // ── Organization & branches ──────────────────────────────────────────────
  const org = await db.organization.create({
    data: {
      productName: "مکتب‌یار",
      name: "مکتب خصوصی روشن",
      schoolType: "private",
      province: "کابل",
      district: "ناحیهٔ ششم",
      address: "سرک پانزدهم، کارتهٔ نو، کابل",
      phone: "+93701112233",
      emisCode: "EMIS-000000",
      registrationNumber: "REG-1405-001",
      reportHeading: "ریاست تعلیم و تربیهٔ ولایت کابل — ادارهٔ تعلیم ناحیهٔ ششم",
      reportFooter: "مکتب خصوصی روشن — کابل",
      // The demo ships fully configured; the setup wizard is exercised via
      // tests and is shown again on a fresh database.
      isConfigured: true,
    },
  });

  const mainBranch = await db.branch.create({
    data: {
      orgId: org.id,
      name: "شعبهٔ مرکزی — کارتهٔ نو",
      code: "MAIN",
      province: "کابل",
      district: "ناحیهٔ ششم",
      address: "سرک پانزدهم، کارتهٔ نو",
      phone: "+93701112233",
    },
  });
  const secondBranch = await db.branch.create({
    data: {
      orgId: org.id,
      name: "شعبهٔ دوم — خوشحال خان",
      code: "KHK",
      province: "کابل",
      district: "ناحیهٔ پنجم",
      address: "خوشحال خان، سرک دوازدهم",
      phone: "+93701112244",
    },
  });

  // ── Academic year ۱۴۰۵ (Solar Hijri) ─────────────────────────────────────
  const year1405 = await db.academicYear.create({
    data: {
      orgId: org.id,
      name: "۱۴۰۵",
      // 1405 Solar Hijri ≈ 2026-03-21 .. 2027-03-20
      startDate: "2026-03-21",
      endDate: "2027-03-20",
      isCurrent: true,
      status: "active",
    },
  });
  await db.term.createMany({
    data: [
      { academicYearId: year1405.id, name: "نیم‌سال اول", index: 1, startDate: "2026-03-21", endDate: "2026-09-22" },
      { academicYearId: year1405.id, name: "نیم‌سال دوم", index: 2, startDate: "2026-09-23", endDate: "2027-03-20" },
    ],
  });

  // ── Grades 1..12 ─────────────────────────────────────────────────────────
  const grades = await Promise.all(
    GRADE_NAMES.map((nameDari, i) =>
      db.gradeLevel.create({ data: { orgId: org.id, level: i + 1, nameDari } }),
    ),
  );

  // ── Shifts ───────────────────────────────────────────────────────────────
  const morning = await db.shift.create({
    data: { orgId: org.id, name: "صبح", startTime: "07:00", endTime: "11:30" },
  });
  const noon = await db.shift.create({
    data: { orgId: org.id, name: "چاشت", startTime: "12:00", endTime: "16:30" },
  });

  // ── Class sections (grades 1–9, two-three sections each) ────────────────
  const sections: Record<string, { id: string; grade: number; label: string }> = {};
  for (const g of grades) {
    const count = g.level <= 9 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const label = SECTION_LABELS[i] ?? `شعبه-${i + 1}`;
      const s = await db.classSection.create({
        data: {
          academicYearId: year1405.id,
          gradeLevelId: g.id,
          branchId: g.level <= 6 ? mainBranch.id : secondBranch.id,
          shiftId: g.level <= 6 ? morning.id : noon.id,
          roomName: `اتاق ${g.level}${i + 1}`,
          capacity: 30,
          label,
        },
      });
      sections[`${g.level}-${i}`] = { id: s.id, grade: g.level, label };
    }
  }

  // ── Subjects (configurable, not claimed as ministry curriculum) ─────────
  const subjects = [
    { nameDari: "دری", code: "DARI", grades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { nameDari: "ریاضی", code: "MATH", grades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { nameDari: "علوم", code: "SCI", grades: [4, 5, 6, 7, 8] },
    { nameDari: "جغرافیا", code: "GEO", grades: [5, 6, 7, 8, 9] },
    { nameDari: "تاریخ", code: "HIST", grades: [5, 6, 7, 8, 9] },
    { nameDari: "انگلیسی", code: "ENG", grades: [4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { nameDari: "قرآن و تعلیمات اسلامی", code: "ISLAM", grades: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { nameDari: "معلومات عمومی", code: "GEN", grades: [7, 8, 9] },
    { nameDari: "کمپیوتر", code: "ICT", grades: [7, 8, 9, 10, 11, 12] },
  ];
  for (const s of subjects) {
    await db.subject.create({
      data: { orgId: org.id, nameDari: s.nameDari, code: s.code, grades: JSON.stringify(s.grades) },
    });
  }

  // ── Users & roles ────────────────────────────────────────────────────────
  const users = [
    { username: "admin", password: "Admin1234", fullName: "انجنیر احمد شاه ولی‌زاده", role: "admin", branch: null },
    { username: "manager", password: "Manager1234", fullName: "استاد عبدالقادر برات", role: "manager", branch: null },
    { username: "academic", password: "Academic1234", fullName: "استاد سمیع‌الله نوری", role: "academic_manager", branch: null },
    { username: "registrar", password: "Registrar1234", fullName: "محترمه نعیمه صمدی", role: "registrar", branch: null },
    { username: "finance", password: "Finance1234", fullName: "محترم حبیب‌الله رفیعی", role: "finance_officer", branch: null },
    { username: "cashier", password: "Cashier1234", fullName: "محترمه لیلا احمدی", role: "cashier", branch: null },
    { username: "teacher", password: "Teacher1234", fullName: "استاد خالد حسینی", role: "teacher", branch: mainBranch.id },
    { username: "librarian", password: "Library1234", fullName: "محترم ظاهر شریفی", role: "librarian", branch: null },
    { username: "hr", password: "Hr12345678", fullName: "محترمه صغری امامی", role: "hr_officer", branch: null },
    { username: "auditor", password: "Auditor1234", fullName: "محترم ناصر مهدوی", role: "auditor", branch: null },
  ];
  const userRows: Record<string, { id: string }> = {};
  for (const u of users) {
    const row = await db.user.create({
      data: {
        username: u.username,
        passwordHash: hashPassword(u.password),
        fullName: u.fullName,
        phone: `+93700${u.username.length}00${Math.floor(Math.random() * 90 + 10)}`,
        isActive: true,
      },
    });
    userRows[u.username] = row;
    await db.userRole.create({
      data: {
        userId: row.id,
        roleKey: u.role,
        branchId: u.branch,
        sectionIds: JSON.stringify([]),
      },
    });
  }

  // ── Students + guardians + enrollments ───────────────────────────────────
  const guardianByPhone: Record<string, { id: string }> = {};
  let studentSeq = 0;
  const all = [...STUDENTS, ...SIBLINGS, ...P2_STUDENTS];
  for (const s of all) {
    studentSeq += 1;
    const studentNumber = `S-1405-${String(studentSeq).padStart(4, "0")}`;
    const student = await db.student.create({
      data: {
        orgId: org.id,
        studentNumber,
        personal: JSON.stringify({
          firstName: s.firstName,
          fatherName: s.fatherName,
          grandfatherName: s.grandfatherName,
          gender: s.gender,
          birthDate: s.birthDate,
          birthPlace: s.birthPlace,
          phone: null,
          address: "کابل، افغانستان",
          previousSchool: "—",
          previousGrade: s.grade - 1,
          healthNotes: studentSeq % 4 === 0 ? "حساسیت فصلی؛ در بهار نیاز به توجه." : null,
        }),
        status: "active",
        createdById: userRows.registrar.id,
      },
    });
    for (const g of s.guardians) {
      let guardianRow = guardianByPhone[g.phone];
      if (!guardianRow) {
        guardianRow = await db.guardian.create({
          data: {
            orgId: org.id,
            fullName: g.fullName,
            relationship: g.relationship,
            phone: g.phone,
            occupation: g.occupation ?? null,
            address: "کابل، افغانستان",
            canPickUp: true,
            portalAccess: g.portalAccess ?? false,
          },
        });
        guardianByPhone[g.phone] = guardianRow;
      }
      await db.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardianRow.id,
          relationship: g.relationship,
          isPrimary: g.isPrimary,
          contactRights: true,
        },
      });
    }
    const sec = sections[`${s.grade}-${s.sectionIdx}`] ?? sections[`${s.grade}-0`];
    await db.enrollment.create({
      data: {
        studentId: student.id,
        academicYearId: year1405.id,
        gradeLevelId: grades[s.grade - 1].id,
        classSectionId: sec.id,
        rollNumber: studentSeq,
        enrolledOn: "2026-03-25",
        status: "active",
      },
    });
    await db.studentDocument.createMany({
      data: [
        { studentId: student.id, type: "tazkira", title: "کاپی تذکره", isVerified: true, uploadedById: userRows.registrar.id },
        { studentId: student.id, type: "photo", title: "عکس پرسنلی", isVerified: true, uploadedById: userRows.registrar.id },
      ],
    });
  }

  // Teacher assignment: خالد حسینی teaches 4-الف, 4-ب and 5-الف.
  const teacherSections = [sections["4-0"].id, sections["4-1"].id, sections["5-0"].id];
  await db.userRole.updateMany({
    where: { userId: userRows.teacher.id },
    data: { sectionIds: JSON.stringify(teacherSections) },
  });

  // ── Parent portal account (linked to فضل‌کریم with two children) ────────
  const parentGuardian = guardianByPhone[SIBLING_GUARDIAN.phone];
  const parentUser = await db.user.create({
    data: {
      username: "walikhal",
      passwordHash: hashPassword("Parent1234"),
      fullName: "فضل//کریم زمردی",
      phone: SIBLING_GUARDIAN.phone,
      isActive: true,
      guardianId: parentGuardian.id,
    },
  });
  await db.userRole.create({
    data: { userId: parentUser.id, roleKey: "parent", sectionIds: JSON.stringify([]) },
  });

  // Student portal account for مینا (own-record scope demo).
  const mina = await db.student.findFirst({
    where: { studentNumber: "S-1405-0009" },
  });
  if (mina) {
    let p: { firstName?: string } = {};
    try { p = JSON.parse(mina.personal); } catch { /* noop */ }
    const selfGuardian = await db.guardian.create({
      data: {
        orgId: org.id,
        fullName: `${p.firstName ?? "شاگرد"} (حساب شاگردی)`,
        relationship: "خودِ شاگرد",
        phone: "+93701234599",
        portalAccess: true,
      },
    });
    await db.studentGuardian.create({
      data: {
        studentId: mina.id,
        guardianId: selfGuardian.id,
        relationship: "خودِ شاگرد",
        isPrimary: false,
        contactRights: true,
      },
    });
    const studentUser = await db.user.create({
      data: {
        username: "shagerd",
        passwordHash: hashPassword("Student1234"),
        fullName: p.firstName ?? "شاگرد",
        phone: "+93701234599",
        isActive: true,
        guardianId: selfGuardian.id,
      },
    });
    await db.userRole.create({
      data: { userId: studentUser.id, roleKey: "student", sectionIds: JSON.stringify([]) },
    });
  }

  // ── Applications in various states ───────────────────────────────────────
  let appSeq = 0;
  for (const a of APPLICATIONS) {
    appSeq += 1;
    const applicantNumber = `A-1405-${String(appSeq).padStart(4, "0")}`;
    await db.application.create({
      data: {
        orgId: org.id,
        academicYearId: year1405.id,
        applicantNumber,
        personal: JSON.stringify({
          firstName: a.firstName,
          fatherName: a.fatherName,
          grandfatherName: a.grandfatherName,
          gender: a.gender,
          birthDate: a.birthDate,
          birthPlace: a.birthPlace,
          phone: a.phone,
          address: "کابل، افغانستان",
          previousSchool: "—",
          previousGrade: a.grade - 1,
        }),
        requestedGradeId: grades[a.grade - 1].id,
        guardians: JSON.stringify([
          { ...a.guardian, contactRights: true, portalAccess: a.guardian.portalAccess ?? false },
        ]),
        documents: JSON.stringify([
          { type: "tazkira", title: "کاپی تذکره", provided: true },
          { type: "photo", title: "عکس پرسنلی", provided: a.status !== "draft" },
          { type: "previous_certificate", title: "سند تعلیمات قبلی", provided: false },
        ]),
        status: a.status,
        decisionNote: a.note ?? null,
        submittedAt: a.status !== "draft" ? new Date() : null,
        reviewedAt: ["under_review", "approved", "rejected", "enrolled"].includes(a.status) ? new Date() : null,
        reviewedById: ["under_review", "approved", "rejected", "enrolled"].includes(a.status) ? userRows.academic.id : null,
        decidedAt: ["approved", "rejected"].includes(a.status) ? new Date() : null,
        decidedById: ["approved", "rejected"].includes(a.status) ? userRows.manager.id : null,
        createdById: userRows.registrar.id,
      },
    });
  }

  // ── Settings + notifications + audit trail examples ──────────────────────
  await db.setting.create({
    data: {
      key: "app",
      value: JSON.stringify({
        modules: {
          fees: true, accounting: true, payroll: false, library: true,
          textbooks: true, transport: false, inventory: false, hr: true,
          communications: true, portals: true,
        },
      }),
    },
  });

  // Document numbering counters must match the records created above, so
  // runtime generation (nextDocNumber) continues without collisions.
  await db.counter.createMany({
    data: [
      { key: `applicant:${year1405.name}`, value: appSeq },
      { key: `student:${year1405.name}`, value: studentSeq },
    ],
  });

  await db.notification.createMany({
    data: [
      {
        userId: userRows.manager.id,
        type: "application.submitted",
        title: "درخواست شمولیت جدید",
        body: "درخواست A-1405-0002 ارائه شد و منتظر بررسی است.",
        link: "#/admissions",
      },
      {
        userId: userRows.registrar.id,
        type: "system",
        title: "خوش آمدید",
        body: "داده‌های نمایشی مکتب‌یار با موفقیت ایجاد شد.",
      },
    ],
  });

  await db.auditEvent.createMany({
    data: [
      {
        actorId: userRows.admin.id,
        actorName: "انجنیر احمد شاه ولی‌زاده",
        action: "system.seed",
        entity: "Organization",
        entityId: org.id,
        after: JSON.stringify({ demo: true, note: "داده‌های نمایشی مصنوعی" }),
        ip: "127.0.0.1",
      },
    ],
  });

  // ── Phase 2: staff register ───────────────────────────────────────────
  // خالد حسینی (existing `teacher` user) becomes a linked StaffMember.
  const khaled = await db.staffMember.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      userId: userRows.teacher.id,
      fullName: "استاد خالد حسینی",
      fatherName: "نظرحسین",
      gender: "male",
      birthDate: "1990-05-12",
      phone: "+93700111201",
      address: "کابل، کارتهٔ نو",
      position: "teacher",
      qualification: "لیسانس ریاضی — دانشگاه تعلیم و تربیه کابل",
      hireDate: "2022-03-01",
      employmentType: "full_time",
      status: "active",
    },
  });
  const nargis = await db.staffMember.create({
    data: {
      orgId: org.id, branchId: mainBranch.id,
      fullName: "محترمه نرگس جان آصفی", fatherName: "محب",
      gender: "female", birthDate: "1993-02-08", phone: "+93700111202",
      position: "teacher", qualification: "لیسانس ادبیات دری",
      hireDate: "2023-03-01", employmentType: "full_time", status: "active",
    },
  });
  const akmal = await db.staffMember.create({
    data: {
      orgId: org.id, branchId: mainBranch.id,
      fullName: "محمد اکمل صافی", fatherName: "عبدالرحیم",
      gender: "male", birthDate: "1988-09-25", phone: "+93700111203",
      position: "teacher", qualification: "لیسانس زبان انگلیسی",
      hireDate: "2021-09-01", employmentType: "full_time", status: "active",
    },
  });
  // Admin/support staff linked to their existing portal accounts.
  const adminStaffRows = [
    { user: userRows.manager, fullName: "استاد عبدالقادر برات", fatherName: "شاهد", gender: "male", birthDate: "1979-07-04", position: "admin_staff", qualification: "لیسانس مدیریت" },
    { user: userRows.academic, fullName: "استاد سمیع‌الله نوری", fatherName: "غلام‌حیدر", gender: "male", birthDate: "1982-11-17", position: "admin_staff", qualification: "لیسانس تعلیم و تربیه" },
    { user: userRows.registrar, fullName: "محترمه نعیمه صمدی", fatherName: "یوسف", gender: "female", birthDate: "1995-01-23", position: "admin_staff", qualification: "دیپلم حسابداری و ثبت" },
    { user: userRows.finance, fullName: "محترم حبیب‌الله رفیعی", fatherName: "قاسم", gender: "male", birthDate: "1986-03-30", position: "admin_staff", qualification: "لیسانس اقتصاد" },
    { user: userRows.librarian, fullName: "محترم ظاهر شریفی", fatherName: "داوود", gender: "male", birthDate: "1991-12-09", position: "support", qualification: "دیپلم لیسه" },
  ];
  for (const s of adminStaffRows) {
    await db.staffMember.create({
      data: {
        orgId: org.id, branchId: mainBranch.id, userId: s.user.id,
        fullName: s.fullName, fatherName: s.fatherName, gender: s.gender,
        birthDate: s.birthDate, phone: `+9370011${Math.floor(Math.random() * 90000 + 10000)}`,
        position: s.position, qualification: s.qualification,
        hireDate: "2022-03-01", employmentType: "full_time", status: "active",
      },
    });
  }

  // ── Phase 2: teaching assignments ────────────────────────────────────
  const subj = {
    dari: await db.subject.findFirstOrThrow({ where: { code: "DARI" } }),
    math: await db.subject.findFirstOrThrow({ where: { code: "MATH" } }),
    sci: await db.subject.findFirstOrThrow({ where: { code: "SCI" } }),
    eng: await db.subject.findFirstOrThrow({ where: { code: "ENG" } }),
  };
  const assignments = [
    { staff: khaled, subject: subj.math, sections: ["4-0", "4-1", "5-0"] },
    { staff: khaled, subject: subj.sci, sections: ["4-0", "5-0"] },
    { staff: nargis, subject: subj.dari, sections: ["3-0", "4-0", "4-1", "5-0"] },
    { staff: akmal, subject: subj.eng, sections: ["4-0", "4-1", "5-0"] },
  ];
  for (const a of assignments) {
    for (const key of a.sections) {
      const sec = sections[key];
      if (!sec) continue;
      await db.teachingAssignment.create({
        data: {
          academicYearId: year1405.id,
          classSectionId: sec.id,
          subjectId: a.subject.id,
          staffId: a.staff.id,
          createdById: userRows.academic.id,
        },
      });
    }
  }

  // ── Phase 2: weekly timetable for 4-الف and 5-الف ─────────────────────
  // Rotation avoids teacher clashes: خالد(ریاضی/علوم), نرگس(دری), اکمل(انگلیسی)
  const plan40 = [subj.dari, subj.math, subj.sci, subj.eng];
  const plan50 = [subj.sci, subj.eng, subj.dari, subj.math];
  const staffOf = (s: { id: string; code: string }) =>
    s.code === "DARI" ? nargis : s.code === "MATH" || s.code === "SCI" ? khaled : akmal;
  for (let weekday = 0; weekday <= 4; weekday++) {
    for (let p = 0; p < 4; p++) {
      await db.timetableSlot.create({
        data: {
          classSectionId: sections["4-0"].id, weekday, period: p + 1,
          subjectId: plan40[p].id, staffId: staffOf(plan40[p]).id,
          roomName: `اتاق 4${1}`,
          createdById: userRows.academic.id,
        },
      });
      await db.timetableSlot.create({
        data: {
          classSectionId: sections["5-0"].id, weekday, period: p + 1,
          subjectId: plan50[p].id, staffId: staffOf(plan50[p]).id,
          roomName: "اتاق 51",
          createdById: userRows.academic.id,
        },
      });
    }
  }

  // ── Phase 2: attendance history (last school week) ────────────────────
  // Whole-day sessions; submitted ones count in statistics, one open today.
  const studentsOf = async (key: string) =>
    db.enrollment.findMany({
      where: { classSectionId: sections[key].id, status: "active" },
      include: { student: true },
      orderBy: { rollNumber: "asc" },
    });

  const attendanceDays = [
    { date: "2026-11-01", submit: true },
    { date: "2026-11-02", submit: true },
    { date: "2026-11-03", submit: true },
    { date: "2026-11-04", submit: true },
    { date: "2026-11-05", submit: true },
  ];
  for (const key of ["4-0", "4-1", "5-0"]) {
    const roster = await studentsOf(key);
    for (const day of attendanceDays) {
      const session = await db.attendanceSession.create({
        data: {
          classSectionId: sections[key].id,
          date: day.date,
          period: 0,
          status: "submitted",
          recordedById: khaled.id,
          submittedById: khaled.id,
          submittedAt: new Date(),
        },
      });
      let i = 0;
      for (const e of roster) {
        // 4th student absent every other day; one excused; one late pattern.
        let status: "present" | "absent" | "late" | "excused" = "present";
        if (i === 3 && (day.date === "2026-11-02" || day.date === "2026-11-04")) status = "absent";
        else if (i === 1 && day.date === "2026-11-03") status = "late";
        else if (i === 2 && day.date === "2026-11-05") status = "excused";
        await db.attendanceRecord.create({
          data: { sessionId: session.id, studentId: e.student.id, status },
        });
        i += 1;
      }
    }
    // Today's session still open (demonstrates the record → submit flow).
    await db.attendanceSession.create({
      data: {
        classSectionId: sections[key].id,
        date: "2026-11-06",
        period: 0,
        status: "open",
        recordedById: khaled.id,
      },
    });
  }

  // ── Phase 2: assessments & grades ─────────────────────────────────────
  async function addAssessment(opts: {
    sectionKey: string; subject: { id: string }; staff: { id: string };
    title: string; type: string; maxScore: number; weight: number;
    date: string; status: string;
    scores: Array<{ studentNumber: string; score: number | null; isAbsent?: boolean }>;
  }) {
    const sec = sections[opts.sectionKey];
    const a = await db.assessment.create({
      data: {
        orgId: org.id,
        academicYearId: year1405.id,
        classSectionId: sec.id,
        subjectId: opts.subject.id,
        staffId: opts.staff.id,
        title: opts.title,
        type: opts.type,
        date: opts.date,
        maxScore: opts.maxScore,
        weight: opts.weight,
        status: opts.status,
        createdById: userRows.academic.id,
        ...(opts.status === "published" ? {
          publishedById: userRows.manager.id,
          publishedAt: new Date(),
          gradingPolicy: JSON.stringify({ maxScore: opts.maxScore, weight: opts.weight, type: opts.type }),
        } : {}),
      },
    });
    for (const s of opts.scores) {
      const st = await db.student.findFirst({ where: { studentNumber: s.studentNumber } });
      if (!st) continue;
      await db.grade.create({
        data: {
          assessmentId: a.id,
          studentId: st.id,
          score: s.score,
          isAbsent: s.isAbsent ?? false,
          enteredById: userRows.teacher.id,
          enteredAt: new Date(),
        },
      });
    }
    return a;
  }

  // Published midterm — ریاضی, section 4-0 (all graded).
  await addAssessment({
    sectionKey: "4-0", subject: subj.math, staff: khaled,
    title: "امتحان میان‌ترم ریاضی — نیم‌سال اول", type: "midterm",
    maxScore: 40, weight: 2, date: "2026-09-10", status: "published",
    scores: [
      { studentNumber: "S-1405-0003", score: 36 },
      { studentNumber: "S-1405-0011", score: 31 },
      { studentNumber: "S-1405-0012", score: 24 },
      { studentNumber: "S-1405-0013", score: 28 },
    ],
  });
  // Published quiz — دری, section 4-0 (one student was absent on exam day).
  await addAssessment({
    sectionKey: "4-0", subject: subj.dari, staff: nargis,
    title: "کوئیز درس اول — امالی و انشاء", type: "quiz",
    maxScore: 10, weight: 1, date: "2026-10-18", status: "published",
    scores: [
      { studentNumber: "S-1405-0003", score: 9 },
      { studentNumber: "S-1405-0011", score: 8 },
      { studentNumber: "S-1405-0012", score: null, isAbsent: true },
      { studentNumber: "S-1405-0013", score: 10 },
    ],
  });
  // Grading in progress — ریاضی quiz, section 4-0 (missing ≠ zero demo:
  // two students not yet graded).
  await addAssessment({
    sectionKey: "4-0", subject: subj.math, staff: khaled,
    title: "کوئیز ضرب و تقسیم", type: "quiz",
    maxScore: 10, weight: 1, date: "2026-11-02", status: "grading",
    scores: [
      { studentNumber: "S-1405-0003", score: 10 },
      { studentNumber: "S-1405-0011", score: 7 },
    ],
  });
  // Published midterm for 4-1 (parent/مینا demo) and 5-0.
  await addAssessment({
    sectionKey: "4-1", subject: subj.math, staff: khaled,
    title: "امتحان میان‌ترم ریاضی — نیم‌سال اول", type: "midterm",
    maxScore: 40, weight: 2, date: "2026-09-10", status: "published",
    scores: [{ studentNumber: "S-1405-0009", score: 33 }],
  });
  await addAssessment({
    sectionKey: "4-1", subject: subj.dari, staff: nargis,
    title: "کوئیز امالی — حروف و حرکات", type: "quiz",
    maxScore: 10, weight: 1, date: "2026-10-20", status: "published",
    scores: [{ studentNumber: "S-1405-0009", score: 9 }],
  });
  await addAssessment({
    sectionKey: "5-0", subject: subj.math, staff: khaled,
    title: "امتحان میان‌ترم ریاضی — نیم‌سال اول", type: "midterm",
    maxScore: 40, weight: 2, date: "2026-09-11", status: "published",
    scores: [
      { studentNumber: "S-1405-0001", score: 38 },
      { studentNumber: "S-1405-0014", score: 27 },
      { studentNumber: "S-1405-0015", score: 33 },
    ],
  });

  console.log("✅ Seed complete.");
  console.log("   Demo logins (all fictional):");
  console.log("   admin / Admin1234 · manager / Manager1234 · registrar / Registrar1234");
  console.log("   academic / Academic1234 · teacher / Teacher1234 · finance / Finance1234");
  console.log("   cashier / Cashier1234 · librarian / Library1234 · hr / Hr12345678");
  console.log("   auditor / Auditor1234 · walikhal / Parent1234 (ولی با دو فرزند)");
  console.log("   shagerd / Student1234 (حساب شاگردی)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
