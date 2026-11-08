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
    // ── Phase 4/5 children FIRST (FK order): loans/copies/titles,
    //    read receipts/announcements/messages, passengers/routes,
    //    movements/items, guests, events, promotion decisions.
    db.bookLoan.deleteMany(),
    db.bookCopy.deleteMany(),
    db.bookTitle.deleteMany(),
    db.announcementRead.deleteMany(),
    db.announcement.deleteMany(),
    db.messageLog.deleteMany(),
    db.transportPassenger.deleteMany(),
    db.transportRoute.deleteMany(),
    db.inventoryMovement.deleteMany(),
    db.inventoryItem.deleteMany(),
    db.guestVisit.deleteMany(),
    db.schoolEvent.deleteMany(),
    db.disciplineIncident.deleteMany(),
    db.promotionDecision.deleteMany(),
    // Phase 3 — finance (children before parents)
    db.payrollItem.deleteMany(),
    db.payrollRun.deleteMany(),
    db.payment.deleteMany(),
    db.invoice.deleteMany(),
    db.expense.deleteMany(),
    db.discount.deleteMany(),
    db.feeStructure.deleteMany(),
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
      name: "مکروسافت مکتب",
      schoolType: "private",
      province: "کابل",
      district: "ناحیهٔ ششم",
      address: "سرک پانزدهم، کارتهٔ نو، کابل",
      phone: "+93701112233",
      emisCode: "EMIS-000000",
      registrationNumber: "REG-1405-001",
      reportHeading: "ریاست تعلیم و تربیهٔ ولایت کابل — ادارهٔ تعلیم ناحیهٔ ششم",
      reportFooter: "مکروسافت مکتب — کابل",
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
  // BRANCH ISOLATION: every operational user is bound to a branch via
  // UserRole.branchId. Only admin and the general_manager (مدیر عام) stay
  // cross-branch. manager2/teacher2 belong to the second branch (خوشحال خان)
  // to demonstrate strict isolation.
  const users = [
    { username: "admin", password: "Admin1234", fullName: "انجنیر احمد شاه ولی‌زاده", role: "admin", branch: null },
    { username: "gm", password: "General1234", fullName: "محترم یوسف قره‌باغی", role: "general_manager", branch: null },
    { username: "manager", password: "Manager1234", fullName: "استاد عبدالقادر برات", role: "manager", branch: mainBranch.id },
    { username: "academic", password: "Academic1234", fullName: "استاد سمیع‌الله نوری", role: "academic_manager", branch: mainBranch.id },
    { username: "registrar", password: "Registrar1234", fullName: "محترمه نعیمه صمدی", role: "registrar", branch: mainBranch.id },
    { username: "finance", password: "Finance1234", fullName: "محترم حبیب‌الله رفیعی", role: "finance_officer", branch: mainBranch.id },
    { username: "cashier", password: "Cashier1234", fullName: "محترمه لیلا احمدی", role: "cashier", branch: mainBranch.id },
    { username: "teacher", password: "Teacher1234", fullName: "استاد خالد حسینی", role: "teacher", branch: mainBranch.id },
    { username: "librarian", password: "Library1234", fullName: "محترم ظاهر شریفی", role: "librarian", branch: mainBranch.id },
    { username: "hr", password: "Hr12345678", fullName: "محترمه صغری امامی", role: "hr_officer", branch: mainBranch.id },
    { username: "auditor", password: "Auditor1234", fullName: "محترم ناصر مهدوی", role: "auditor", branch: mainBranch.id },
    { username: "manager2", password: "Manager1234", fullName: "محترمه صدیقه بارک‌زی", role: "manager", branch: secondBranch.id },
    { username: "teacher2", password: "Teacher1234", fullName: "استاد حمیدالله صاحب‌زاده", role: "teacher", branch: secondBranch.id },
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
  // Second-branch teacher: حمیدالله صاحب‌زاده teaches 7-الف.
  await db.userRole.updateMany({
    where: { userId: userRows.teacher2.id },
    data: { sectionIds: JSON.stringify([sections["7-0"].id]) },
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
  const applications = APPLICATIONS;
  let appSeq = 0;
  for (const a of applications) {
    appSeq += 1;
    const applicantNumber = `A-1405-${String(appSeq).padStart(4, "0")}`;
    // Branch isolation: applications belong to the branch of their grade
    // (grades 1–6 → کارتهٔ نو، grades 7+ → خوشحال خان).
    const appBranch = a.grade <= 6 ? mainBranch.id : secondBranch.id;
    await db.application.create({
      data: {
        orgId: org.id,
        academicYearId: year1405.id,
        branchId: appBranch,
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
          fees: true, accounting: true, payroll: true, library: true,
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
      salaryDiram: 45_000 * 100,
    },
  });
  const nargis = await db.staffMember.create({
    data: {
      orgId: org.id, branchId: mainBranch.id,
      fullName: "محترمه نرگس جان آصفی", fatherName: "محب",
      gender: "female", birthDate: "1993-02-08", phone: "+93700111202",
      position: "teacher", qualification: "لیسانس ادبیات دری",
      hireDate: "2023-03-01", employmentType: "full_time", status: "active",
      salaryDiram: 40_000 * 100,
    },
  });
  const akmal = await db.staffMember.create({
    data: {
      orgId: org.id, branchId: mainBranch.id,
      fullName: "محمد اکمل صافی", fatherName: "عبدالرحیم",
      gender: "male", birthDate: "1988-09-25", phone: "+93700111203",
      position: "teacher", qualification: "لیسانس زبان انگلیسی",
      hireDate: "2021-09-01", employmentType: "full_time", status: "active",
      salaryDiram: 42_000 * 100,
    },
  });
  // Admin/support staff linked to their existing portal accounts.
  const adminStaffRows = [
    { user: userRows.manager, fullName: "استاد عبدالقادر برات", fatherName: "شاهد", gender: "male", birthDate: "1979-07-04", position: "admin_staff", qualification: "لیسانس مدیریت", salary: 60_000 },
    { user: userRows.academic, fullName: "استاد سمیع‌الله نوری", fatherName: "غلام‌حیدر", gender: "male", birthDate: "1982-11-17", position: "admin_staff", qualification: "لیسانس تعلیم و تربیه", salary: 55_000 },
    { user: userRows.registrar, fullName: "محترمه نعیمه صمدی", fatherName: "یوسف", gender: "female", birthDate: "1995-01-23", position: "admin_staff", qualification: "دیپلم حسابداری و ثبت", salary: 35_000 },
    { user: userRows.finance, fullName: "محترم حبیب‌الله رفیعی", fatherName: "قاسم", gender: "male", birthDate: "1986-03-30", position: "admin_staff", qualification: "لیسانس اقتصاد", salary: 38_000 },
    { user: userRows.librarian, fullName: "محترم ظاهر شریفی", fatherName: "داوود", gender: "male", birthDate: "1991-12-09", position: "support", qualification: "دیپلم لیسه", salary: 30_000 },
  ];
  for (const s of adminStaffRows) {
    await db.staffMember.create({
      data: {
        orgId: org.id, branchId: mainBranch.id, userId: s.user.id,
        fullName: s.fullName, fatherName: s.fatherName, gender: s.gender,
        birthDate: s.birthDate, phone: `+9370011${Math.floor(Math.random() * 90000 + 10000)}`,
        position: s.position, qualification: s.qualification,
        hireDate: "2022-03-01", employmentType: "full_time", status: "active",
        salaryDiram: s.salary * 100,
      },
    });
  }

  // ── Phase 2/3: second-branch staff (خوشحال خان) ──────────────────────
  const hamid = await db.staffMember.create({
    data: {
      orgId: org.id, branchId: secondBranch.id, userId: userRows.teacher2.id,
      fullName: "استاد حمیدالله صاحب‌زاده", fatherName: "نظر",
      gender: "male", birthDate: "1987-04-19", phone: "+93700111211",
      address: "کابل، خوشحال خان",
      position: "teacher", qualification: "لیسانس جغرافیا",
      hireDate: "2022-09-01", employmentType: "full_time", status: "active",
      salaryDiram: 43_000 * 100,
    },
  });
  const nasrin = await db.staffMember.create({
    data: {
      orgId: org.id, branchId: secondBranch.id,
      fullName: "محترمه نسرین عثمانی", fatherName: "عبدالستار",
      gender: "female", birthDate: "1994-07-08", phone: "+93700111212",
      position: "teacher", qualification: "لیسانس انگلیسی",
      hireDate: "2023-09-01", employmentType: "full_time", status: "active",
      salaryDiram: 39_000 * 100,
    },
  });
  await db.staffMember.create({
    data: {
      orgId: org.id, branchId: secondBranch.id, userId: userRows.manager2.id,
      fullName: "محترمه صدیقه بارک‌زی", fatherName: "غلام",
      gender: "female", birthDate: "1981-02-14", phone: "+93700111213",
      position: "admin_staff", qualification: "لیسانس مدیریت تعلیمی",
      hireDate: "2021-03-01", employmentType: "full_time", status: "active",
      salaryDiram: 52_000 * 100,
    },
  });

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

  // ── Phase 2/3: second-branch teaching, timetable & attendance (7-الف) ──
  const subjGeo = await db.subject.findFirstOrThrow({ where: { code: "GEO" } });
  const assignments2 = [
    { staff: hamid, subject: subjGeo, sections: ["7-0"] },
    { staff: nasrin, subject: subj.eng, sections: ["7-0"] },
  ];
  for (const a of assignments2) {
    for (const key of a.sections) {
      const sec = sections[key];
      if (!sec) continue;
      await db.teachingAssignment.create({
        data: {
          academicYearId: year1405.id,
          classSectionId: sec.id,
          subjectId: a.subject.id,
          staffId: a.staff.id,
          createdById: userRows.manager2.id,
        },
      });
    }
  }
  for (let weekday = 0; weekday <= 4; weekday++) {
    for (let p = 0; p < 2; p++) {
      await db.timetableSlot.create({
        data: {
          classSectionId: sections["7-0"].id, weekday, period: p + 1,
          subjectId: p === 0 ? subjGeo.id : subj.eng.id,
          staffId: p === 0 ? hamid.id : nasrin.id,
          roomName: "اتاق 71",
          createdById: userRows.manager2.id,
        },
      });
    }
  }
  {
    const roster = await studentsOf("7-0");
    for (const day of attendanceDays) {
      const session = await db.attendanceSession.create({
        data: {
          classSectionId: sections["7-0"].id,
          date: day.date,
          period: 0,
          status: "submitted",
          recordedById: hamid.id,
          submittedById: hamid.id,
          submittedAt: new Date(),
        },
      });
      let i = 0;
      for (const e of roster) {
        const status: "present" | "absent" | "late" | "excused" =
          i === 2 && day.date === "2026-11-03" ? "absent" : "present";
        await db.attendanceRecord.create({
          data: { sessionId: session.id, studentId: e.student.id, status },
        });
        i += 1;
      }
    }
  }
  await addAssessment({
    sectionKey: "7-0", subject: subjGeo, staff: hamid,
    title: "کوئیز جغرافیا — قاره‌ها", type: "quiz",
    maxScore: 10, weight: 1, date: "2026-10-28", status: "published",
    scores: [],
  });

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

  // ── Phase 3: fees & finance ───────────────────────────────────────────
  // Money: integers in diram (100 diram = 1 AFN). Months: Solar Hijri keys.
  // 1405-07 = میزان (2026-09-23..2026-10-22), 1405-08 = عقرب (2026-10-23..).
  const feeMonthlyMain = await db.feeStructure.create({
    data: {
      orgId: org.id, academicYearId: year1405.id, branchId: mainBranch.id,
      name: "شهریهٔ ماهانهٔ صنوف ۱–۶",
      gradeLevels: JSON.stringify([1, 2, 3, 4, 5, 6]),
      periodKind: "monthly", amountDiram: 1_200 * 100,
      note: "شعبهٔ کارتهٔ نو — صبح", createdById: userRows.finance.id,
    },
  });
  const feeMonthlySecond = await db.feeStructure.create({
    data: {
      orgId: org.id, academicYearId: year1405.id, branchId: secondBranch.id,
      name: "شهریهٔ ماهانهٔ صنوف ۷–۹",
      gradeLevels: JSON.stringify([7, 8, 9]),
      periodKind: "monthly", amountDiram: 1_500 * 100,
      note: "شعبهٔ خوشحال خان — چاشت", createdById: userRows.finance.id,
    },
  });
  const feeRegistration = await db.feeStructure.create({
    data: {
      orgId: org.id, academicYearId: year1405.id, branchId: null,
      name: "فیس ثبت‌نام ۱۴۰۵",
      gradeLevels: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      periodKind: "one_time", amountDiram: 500 * 100,
      note: "یک‌بار — برای همه شعبه‌ها", createdById: userRows.finance.id,
    },
  });

  // Discounts: 50% for a staff child (S-1405-0003) and a fixed 300 AFN
  // hardship discount (S-1405-0011).
  const st3 = await db.student.findFirst({ where: { studentNumber: "S-1405-0003" } });
  const st11 = await db.student.findFirst({ where: { studentNumber: "S-1405-0011" } });
  if (st3) {
    await db.discount.create({
      data: {
        orgId: org.id, academicYearId: year1405.id, studentId: st3.id,
        kind: "percent", value: 50, reason: "فرزند کارمند مکتب",
        approvedById: userRows.gm.id, status: "approved",
      },
    });
  }
  if (st11) {
    await db.discount.create({
      data: {
        orgId: org.id, academicYearId: year1405.id, studentId: st11.id,
        kind: "fixed_diram", value: 300 * 100, reason: "کم‌درآمدی — تایید مدیر عام",
        approvedById: userRows.gm.id, status: "approved",
      },
    });
  }

  // Invoices for میزان ۱۴۰۵ (1405-07) — every active student per branch;
  // عقرب ۱۴۰۵ (1405-08) — main branch only, to keep the demo data light.
  interface SeedInv { student: { id: string; studentNumber: string }; branchId: string; fee: { id: string; amountDiram: number; name: string }; periodKey: string; periodLabel: string; dueDate: string | null; }
  const invoiceTargets: SeedInv[] = [];
  const activeEnrollments = await db.enrollment.findMany({
    where: { academicYearId: year1405.id, status: "active" },
    include: { student: { select: { id: true, studentNumber: true } }, classSection: { select: { branchId: true } } },
  });
  const mainStudents = activeEnrollments.filter((e) => e.classSection?.branchId === mainBranch.id);
  const secondStudents = activeEnrollments.filter((e) => e.classSection?.branchId === secondBranch.id);
  for (const e of mainStudents) {
    invoiceTargets.push({ student: e.student, branchId: mainBranch.id, fee: feeMonthlyMain, periodKey: "1405-07", periodLabel: "شهریهٔ ماهٔ میزان ۱۴۰۵", dueDate: "2026-10-05" });
  }
  for (const e of secondStudents) {
    invoiceTargets.push({ student: e.student, branchId: secondBranch.id, fee: feeMonthlySecond, periodKey: "1405-07", periodLabel: "شهریهٔ ماهٔ میزان ۱۴۰۵", dueDate: "2026-10-05" });
  }
  for (const e of mainStudents) {
    invoiceTargets.push({ student: e.student, branchId: mainBranch.id, fee: feeMonthlyMain, periodKey: "1405-08", periodLabel: "شهریهٔ ماهٔ عقرب ۱۴۰۵", dueDate: "2026-11-05" });
  }

  // Discount snapshot (largest applicable) per student, mirroring the API.
  const discountByStudent = new Map<string, number>();
  for (const d of await db.discount.findMany({ where: { academicYearId: year1405.id, status: "approved" } })) {
    for (const t of invoiceTargets) {
      if (t.student.id !== d.studentId) continue;
      const amount = t.fee.amountDiram;
      const val = d.kind === "percent" ? Math.round((amount * d.value) / 100) : Math.min(d.value, amount);
      const prev = discountByStudent.get(`${d.studentId}:${t.periodKey}`) ?? 0;
      discountByStudent.set(`${d.studentId}:${t.periodKey}`, Math.max(prev, val));
    }
  }

  let invoiceSeq = 0;
  const invoiceRows: Array<{ id: string; netDiram: number; paidDiram: number; studentId: string; branchId: string; periodKey: string }> = [];
  for (const t of invoiceTargets) {
    invoiceSeq += 1;
    const discountDiram = discountByStudent.get(`${t.student.id}:${t.periodKey}`) ?? 0;
    const netDiram = t.fee.amountDiram - discountDiram;
    const row = await db.invoice.create({
      data: {
        orgId: org.id,
        invoiceNumber: `F-${year1405.name}-${String(invoiceSeq).padStart(4, "0")}`,
        academicYearId: year1405.id,
        branchId: t.branchId,
        studentId: t.student.id,
        feeStructureId: t.fee.id,
        periodKey: t.periodKey,
        periodLabel: t.periodLabel,
        amountDiram: t.fee.amountDiram,
        discountDiram,
        netDiram,
        paidDiram: 0,
        status: "issued",
        dueDate: t.dueDate,
        note: t.fee.name,
        issuedById: userRows.finance.id,
      },
    });
    invoiceRows.push({ id: row.id, netDiram, paidDiram: 0, studentId: t.student.id, branchId: t.branchId, periodKey: t.periodKey });
  }

  // Payments — میزان mostly collected; عقرب partially.
  // Payment plan per invoice: index-based mix of full / partial / unpaid.
  let receiptSeq = 0;
  const paymentDates = ["2026-09-25", "2026-09-28", "2026-10-02", "2026-10-08", "2026-10-15", "2026-10-20"];
  const methods = ["cash", "cash", "cash", "bank", "hawala", "cash"] as const;
  let payIdx = 0;
  for (const inv of invoiceRows) {
    const mode = payIdx % 5; // 0,1,2 → paid; 3 → partial; 4 → unpaid
    payIdx += 1;
    if (mode === 4) continue;
    const amountDiram = mode === 3 ? Math.round(inv.netDiram / 2 / 100) * 100 : inv.netDiram;
    receiptSeq += 1;
    const payment = await db.payment.create({
      data: {
        orgId: org.id,
        receiptNumber: `R-${year1405.name}-${String(receiptSeq).padStart(4, "0")}`,
        invoiceId: inv.id,
        studentId: inv.studentId,
        branchId: inv.branchId,
        amountDiram,
        method: methods[(payIdx - 1) % methods.length],
        date: paymentDates[(payIdx - 1) % paymentDates.length],
        note: null,
        receivedById: userRows.cashier.id,
      },
    });
    void payment;
    inv.paidDiram = amountDiram;
    await db.invoice.update({
      where: { id: inv.id },
      data: {
        paidDiram: amountDiram,
        status: amountDiram >= inv.netDiram ? "paid" : "partially_paid",
      },
    });
  }
  // One voided payment (correction demo) on a fully-paid میزان invoice:
  // void it and return the invoice to partially_paid.
  {
    const firstPaid = invoiceRows.find((r) => r.periodKey === "1405-07" && r.paidDiram >= r.netDiram);
    const voidable = await db.payment.findFirst({
      where: firstPaid ? { invoiceId: firstPaid.id } : {},
      orderBy: { createdAt: "asc" },
    });
    if (voidable) {
      await db.payment.update({
        where: { id: voidable.id },
        data: { voidedById: userRows.finance.id, voidedAt: new Date(), voidReason: "ثبت مبلغ اشتباه در رسید — اصلاح" },
      });
      const inv = invoiceRows.find((r) => r.id === voidable.invoiceId);
      if (inv) {
        const paid = Math.max(0, inv.paidDiram - voidable.amountDiram);
        inv.paidDiram = paid;
        await db.invoice.update({
          where: { id: inv.id },
          data: { paidDiram: paid, status: paid >= inv.netDiram ? "paid" : paid > 0 ? "partially_paid" : "issued" },
        });
      }
    }
  }

  // Expenses — a few per branch across میزان/عقرب.
  const expenses = [
    { branch: mainBranch.id, date: "2026-09-27", category: "utilities", payee: "د برق شرکت — Breshna", amountDiram: 8_500 * 100, note: "برق و آب ماه میزان" },
    { branch: mainBranch.id, date: "2026-10-12", category: "maintenance", payee: "کارگاه ترمیم ناصری", amountDiram: 3_200 * 100, note: "ترمیم تخته‌سپیده و پنجره‌ها" },
    { branch: mainBranch.id, date: "2026-10-20", category: "supplies", payee: "کتاب‌فروشی میهن", amountDiram: 2_400 * 100, note: "لوازم تعلیمی صنوف ابتدایی" },
    { branch: secondBranch.id, date: "2026-10-05", category: "utilities", payee: "د برق شرکت — Breshna", amountDiram: 6_800 * 100, note: "برق و آب ماه میزان" },
    { branch: secondBranch.id, date: "2026-10-25", category: "transport", payee: "خدمات ترانسپورت آرمان", amountDiram: 5_000 * 100, note: "سرویس اساتید خوشحال خان" },
    { branch: mainBranch.id, date: "2026-11-03", category: "other", payee: "چاپ‌خانهٔ نور", amountDiram: 1_500 * 100, note: "چاپ امتحانات میان‌ترم" },
  ];
  let expenseSeq = 0;
  for (const e of expenses) {
    expenseSeq += 1;
    await db.expense.create({
      data: {
        orgId: org.id,
        expenseNumber: `E-${year1405.name}-${String(expenseSeq).padStart(4, "0")}`,
        branchId: e.branch,
        date: e.date,
        category: e.category,
        payee: e.payee,
        amountDiram: e.amountDiram,
        note: e.note,
        paidById: userRows.finance.id,
        approvedById: userRows.gm.id,
      },
    });
  }

  // Payroll — میزان ۱۴۰۵ PAID for both branches (books an expense each),
  // عقرب ۱۴۰۵ APPROVED for main branch (ready to pay in the demo).
  const payslipSeqByPeriod: Record<string, number> = {};
  async function seedPayroll(branchId: string, periodKey: string, periodLabel: string, status: "paid" | "approved", creatorId: string) {
    const staff = await db.staffMember.findMany({
      where: { branchId, status: "active", salaryDiram: { not: null } },
      select: { id: true, fullName: true, salaryDiram: true },
      orderBy: { fullName: "asc" },
    });
    const run = await db.payrollRun.create({
      data: {
        orgId: org.id, branchId, academicYearId: year1405.id,
        periodKey, periodLabel, status: "draft", totalsDiram: 0,
        note: "دادهٔ نمایشی",
        createdById: creatorId,
      },
    });
    let totals = 0;
    const items: Array<{ staffId: string; base: number; allowance: number; deduction: number }> = [];
    for (const s of staff) {
      payslipSeqByPeriod[periodKey] = (payslipSeqByPeriod[periodKey] ?? 0) + 1;
      const slip = payslipSeqByPeriod[periodKey];
      const base = s.salaryDiram as number;
      const allowance = s.fullName.includes("نرگس") ? 2_000 * 100 : 0; // حس‌الوضعیت demo
      const deduction = slip % 4 === 0 ? 500 * 100 : 0; // پیش‌پرداخت demo
      const net = base + allowance - deduction;
      totals += net;
      await db.payrollItem.create({
        data: {
          payrollRunId: run.id, staffId: s.id,
          payslipNumber: `P-${periodKey}-${String(slip).padStart(4, "0")}`,
          baseDiram: base, allowanceDiram: allowance, bonusDiram: 0,
          deductionDiram: deduction, netDiram: net,
        },
      });
      items.push({ staffId: s.id, base, allowance, deduction });
    }
    await db.payrollRun.update({ where: { id: run.id }, data: { totalsDiram: totals } });
    if (status === "paid") {
      await db.payrollRun.update({
        where: { id: run.id },
        data: { status: "paid", approvedById: creatorId, approvedAt: new Date(), paidById: creatorId, paidAt: new Date() },
      });
      expenseSeq += 1;
      await db.expense.create({
        data: {
          orgId: org.id,
          expenseNumber: `E-${year1405.name}-${String(expenseSeq).padStart(4, "0")}`,
          branchId,
          date: "2026-10-22",
          category: "salaries",
          payee: periodLabel,
          amountDiram: totals,
          note: `پرداخت ${periodLabel} — سیشن معاشات`,
          paidById: userRows.finance.id,
          approvedById: creatorId,
        },
      });
    } else {
      await db.payrollRun.update({
        where: { id: run.id },
        data: { status: "approved", approvedById: creatorId, approvedAt: new Date() },
      });
    }
    return { runId: run.id, totals, itemCount: staff.length };
  }
  await seedPayroll(mainBranch.id, "1405-07", "معاشات میزان ۱۴۰۵", "paid", userRows.gm.id);
  await seedPayroll(secondBranch.id, "1405-07", "معاشات میزان ۱۴۰۵", "paid", userRows.gm.id);
  await seedPayroll(mainBranch.id, "1405-08", "معاشات عقرب ۱۴۰۵", "approved", userRows.manager.id);
  void feeRegistration;

  // Counters must match the seeded document numbers so runtime generation
  // (nextDocNumber) continues without collisions.
  await db.counter.createMany({
    data: [
      { key: `invoice:${year1405.name}`, value: invoiceSeq },
      { key: `receipt:${year1405.name}`, value: receiptSeq },
      { key: `expense:${year1405.name}`, value: expenseSeq },
      { key: "payslip:1405-07", value: payslipSeqByPeriod["1405-07"] ?? 0 },
      { key: "payslip:1405-08", value: payslipSeqByPeriod["1405-08"] ?? 0 },
    ],
  });

  // A finance notification for the demo.
  await db.notification.create({
    data: {
      userId: userRows.finance.id,
      type: "payment.collected",
      title: "وصولی جدید",
      body: "رسیدهای ماهٔ میزان ۱۴۰۵ در شعبهٔ کارتهٔ نو ثبت شد.",
      link: "#/finance/payments",
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 4 — library, announcements & messages (demo data)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Library: titles, copies, loans ──────────────────────────────────────
  interface SeedBook { branchId: string; title: string; author: string; publisher: string; isTextbook: boolean; gradeLevels: number[]; copies: number }
  const books: SeedBook[] = [
    { branchId: mainBranch.id, title: "ریاضی صنف پنجم", author: "کتاب‌های تعلیمی مطبوعاتی", publisher: "چاپ دولتی", isTextbook: true, gradeLevels: [5], copies: 4 },
    { branchId: mainBranch.id, title: "دری صنف پنجم", author: "کتاب‌های تعلیمی مطبوعاتی", publisher: "چاپ دولتی", isTextbook: true, gradeLevels: [5], copies: 4 },
    { branchId: mainBranch.id, title: "کلید ذهن — مجموعه قصه‌های کودکان", author: "محمد//رسول بهار", publisher: "انتشارات میهن", isTextbook: false, gradeLevels: [3, 4, 5, 6], copies: 2 },
    { branchId: mainBranch.id, title: "تاریخ افغانستان — مختصر", author: "میر//محمد//صدیق فرهنگ", publisher: "انتشارات سنایی", isTextbook: false, gradeLevels: [7, 8, 9], copies: 3 },
    { branchId: secondBranch.id, title: "علوم صنف هفتم", author: "کتاب‌های تعلیمی مطبوعاتی", publisher: "چاپ دولتی", isTextbook: true, gradeLevels: [7], copies: 3 },
    { branchId: secondBranch.id, title: "انگلیسی مقدماتی", author: "استاد نعیم//الله صافی", publisher: "انتشارات روشن", isTextbook: false, gradeLevels: [7, 8], copies: 2 },
  ];

  let bookSeq = 0;
  for (const b of books) {
    const titleRow = await db.bookTitle.create({
      data: {
        orgId: org.id,
        branchId: b.branchId,
        title: b.title,
        author: b.author,
        publisher: b.publisher,
        gradeLevels: JSON.stringify(b.gradeLevels),
        isTextbook: b.isTextbook,
        createdById: userRows.librarian.id,
      },
    });
    for (let i = 0; i < b.copies; i++) {
      bookSeq += 1;
      await db.bookCopy.create({
        data: {
          orgId: org.id,
          titleId: titleRow.id,
          branchId: b.branchId,
          copyCode: `B-${year1405.name}-${String(bookSeq).padStart(4, "0")}`,
          status: "available",
          condition: i === 0 ? "کم‌استعمال" : "نو",
        },
      });
    }
  }
  await db.counter.create({ data: { key: `book:${year1405.name}`, value: bookSeq } });

  // Loans: one returned on time, one ACTIVE & overdue, one lost with a fine
  // invoice (the fine is a real Invoice row like the runtime issues).
  const allTitles = await db.bookTitle.findMany({
    where: { branchId: mainBranch.id },
    include: { copies: { orderBy: { copyCode: "asc" } } },
  });
  const secondTitles = await db.bookTitle.findMany({
    where: { branchId: secondBranch.id },
    include: { copies: { orderBy: { copyCode: "asc" } } },
  });

  const mainLoanStudents = mainStudents.slice(0, 3);
  const today = new Date();

  // returned on time
  if (allTitles[0] && mainLoanStudents[0]) {
    await db.bookLoan.create({
      data: {
        orgId: org.id,
        copyId: allTitles[0].copies[0].id,
        studentId: mainLoanStudents[0].student.id,
        branchId: mainBranch.id,
        loanedOn: "2026-09-20",
        dueOn: "2026-10-05",
        returnedOn: "2026-10-02",
        status: "returned",
        loanedById: userRows.librarian.id,
        returnedById: userRows.librarian.id,
      },
    });
    await db.bookCopy.update({ where: { id: allTitles[0].copies[0].id }, data: { status: "available" } });
  }
  // active + overdue (due date already passed)
  if (allTitles[2] && mainLoanStudents[1]) {
    await db.bookLoan.create({
      data: {
        orgId: org.id,
        copyId: allTitles[2].copies[0].id,
        studentId: mainLoanStudents[1].student.id,
        branchId: mainBranch.id,
        loanedOn: "2026-09-25",
        dueOn: "2026-10-10",
        status: "active",
        note: "قصه‌نامه برای خانه",
        loanedById: userRows.librarian.id,
      },
    });
    await db.bookCopy.update({ where: { id: allTitles[2].copies[0].id }, data: { status: "loaned" } });
  }
  // lost with fine → linked invoice
  if (allTitles[3] && mainLoanStudents[2]) {
    invoiceSeq += 1;
    const fineInvoice = await db.invoice.create({
      data: {
        orgId: org.id,
        invoiceNumber: `F-${year1405.name}-${String(invoiceSeq).padStart(4, "0")}`,
        academicYearId: year1405.id,
        branchId: mainBranch.id,
        studentId: mainLoanStudents[2].student.id,
        periodKey: `fine:seed-lost-1`,
        periodLabel: `جریمهٔ کتاب «${allTitles[3].title}»`,
        amountDiram: 250 * 100,
        discountDiram: 0,
        netDiram: 250 * 100,
        paidDiram: 0,
        status: "issued",
        note: "جریمهٔ کتابخانه (نسخهٔ گم‌شده)",
        issuedById: userRows.librarian.id,
      },
    });
    await db.bookLoan.create({
      data: {
        orgId: org.id,
        copyId: allTitles[3].copies[0].id,
        studentId: mainLoanStudents[2].student.id,
        branchId: mainBranch.id,
        loanedOn: "2026-09-15",
        dueOn: "2026-09-30",
        status: "lost",
        fineDiram: 250 * 100,
        fineInvoiceId: fineInvoice.id,
        note: "نسخه گم شده است",
        loanedById: userRows.librarian.id,
        returnedById: userRows.librarian.id,
      },
    });
    await db.bookCopy.update({ where: { id: allTitles[3].copies[0].id }, data: { status: "lost" } });
  }
  // second-branch active loan
  if (secondTitles[0] && secondStudents[0]) {
    await db.bookLoan.create({
      data: {
        orgId: org.id,
        copyId: secondTitles[0].copies[0].id,
        studentId: secondStudents[0].student.id,
        branchId: secondBranch.id,
        loanedOn: "2026-10-20",
        dueOn: "2026-11-20",
        status: "active",
        loanedById: userRows.manager2.id,
      },
    });
    await db.bookCopy.update({ where: { id: secondTitles[0].copies[0].id }, data: { status: "loaned" } });
  }
  // keep the invoice counter in sync with the seeded fine invoice
  await db.counter.update({
    where: { key: `invoice:${year1405.name}` },
    data: { value: invoiceSeq },
  });

  // ── Announcements & read receipts ───────────────────────────────────────
  const ann1 = await db.announcement.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      audience: "all",
      title: "جلسهٔ اولیا و اساتید",
      body: "جلسهٔ اولیا روز سه‌شنبه ساعت ۱۰:۰۰ صبح در سالون مکتب برگزار می‌شود. حضور اولیا تقاضا می‌شود.",
      status: "published",
      publishedById: userRows.manager.id,
      publishedAt: today,
    },
  });
  const ann2 = await db.announcement.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      audience: "guardians",
      title: "یادآوری پرداخت شهریهٔ ماه عقرب",
      body: "اولیای محترم خواهشمند است شهریهٔ ماه عقرب ۱۴۰۵ را تا ۵ نوامبر در صندوق مکتب پرداخت نمایند.",
      status: "published",
      publishedById: userRows.finance.id,
      publishedAt: today,
    },
  });
  await db.announcement.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      audience: "staff",
      title: "جلسهٔ کادر تعلیمی (پیش‌نویس)",
      body: "دستور جلسهٔ کادر: آمادگی امتحانات میان‌ترم و تقسیم نگرانی صفوف.",
      status: "draft",
    },
  });
  await db.announcement.create({
    data: {
      orgId: org.id,
      branchId: secondBranch.id,
      audience: "all",
      title: "روز سلامت — شعبهٔ خوشحال خان",
      body: "برنامهٔ روز سلامت با همکاری کلینیک محل، روز پنج‌شنبه در مکتب برگزار می‌گردد.",
      status: "published",
      publishedById: userRows.manager2.id,
      publishedAt: today,
    },
  });
  // read receipts: the cashier and academic read the general announcement
  await db.announcementRead.createMany({
    data: [
      { announcementId: ann1.id, userId: userRows.cashier.id },
      { announcementId: ann1.id, userId: userRows.academic.id },
      { announcementId: ann2.id, userId: userRows.cashier.id },
    ],
  });

  // ── Message log (queued SMS to guardians) ───────────────────────────────
  const guardianPhones = await db.guardian.findMany({
    where: { students: { some: { student: { enrollments: { some: { classSection: { branchId: mainBranch.id } } } } } } },
    select: { phone: true },
    take: 4,
  });
  if (guardianPhones.length > 0) {
    await db.messageLog.createMany({
      data: guardianPhones
        .filter((g) => g.phone)
        .map((g) => ({
          orgId: org.id,
          branchId: mainBranch.id,
          channel: "sms",
          recipient: g.phone as string,
          body: "مکتب مکتب‌یار: یادآوری جلسهٔ اولیا روز سه‌شنبه ساعت ۱۰ صبح.",
          status: "queued",
          relatedType: "Announcement",
          relatedId: ann1.id,
          sentById: userRows.manager.id,
        })),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 5 — services & events (demo data)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Transport routes & passengers ───────────────────────────────────────
  const routeMain = await db.transportRoute.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      name: "سرویس کارتهٔ نو — مسیر اول",
      driverName: "راننده عبدالرحیم",
      vehicle: "کورولا سفید — 04 Kabul 1234",
      capacity: 4,
      monthlyFeeDiram: 600 * 100,
      stops: JSON.stringify(["چواراهی پرچم", "شهرنو", "کارتهٔ نو"]),
      createdById: userRows.manager.id,
    },
  });
  const routeSecond = await db.transportRoute.create({
    data: {
      orgId: org.id,
      branchId: secondBranch.id,
      name: "سرویس خوشحال خان — مسیر اول",
      driverName: "راننده نظر//محمد",
      capacity: 3,
      monthlyFeeDiram: 500 * 100,
      stops: JSON.stringify(["دِه‌سبز", "خوشحال خان"]),
      createdById: userRows.manager2.id,
    },
  });
  for (const [i, e] of mainStudents.slice(0, 3).entries()) {
    await db.transportPassenger.create({
      data: {
        routeId: routeMain.id,
        studentId: e.student.id,
        stopName: ["چواراهی پرچم", "شهرنو", "کارتهٔ نو"][i] ?? null,
        status: "active",
      },
    });
  }
  if (secondStudents[0]) {
    await db.transportPassenger.create({
      data: { routeId: routeSecond.id, studentId: secondStudents[0].student.id, stopName: "دِه‌سبز", status: "active" },
    });
  }

  // ── Inventory items + ledger movements ──────────────────────────────────
  interface SeedItem { branchId: string; name: string; unit: string; received: number; issued: number; min: number }
  const items: SeedItem[] = [
    { branchId: mainBranch.id, name: "تخته‌سپیده", unit: "عدد", received: 60, issued: 35, min: 20 },
    { branchId: mainBranch.id, name: "مداد جعبه‌ای", unit: "بسته", received: 40, issued: 22, min: 10 },
    { branchId: mainBranch.id, name: "گچ سفید", unit: "بسته", received: 30, issued: 28, min: 10 },
    { branchId: secondBranch.id, name: "تخته‌سپیده", unit: "عدد", received: 25, issued: 12, min: 10 },
  ];
  for (const it of items) {
    const item = await db.inventoryItem.create({
      data: {
        orgId: org.id,
        branchId: it.branchId,
        name: it.name,
        unit: it.unit,
        quantity: it.received - it.issued,
        minQuantity: it.min,
        createdById: userRows.manager.id,
      },
    });
    await db.inventoryMovement.create({
      data: { itemId: item.id, delta: it.received, reason: "خرید ابتدای سال تعلیمی", byId: userRows.manager.id },
    });
    await db.inventoryMovement.create({
      data: { itemId: item.id, delta: -it.issued, reason: "توزیع به صنوف", byId: userRows.manager.id },
    });
  }

  // ── Guest register ──────────────────────────────────────────────────────
  await db.guestVisit.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      fullName: "انجنیر حبیب//الله رحیمی",
      purpose: "ملاقات مدیر مکتب — قرارداد ترمیم",
      hostName: "استاد عبدالقادر برات",
      idNumber: "T-1400-1234",
      visitorCount: 2,
      arrivedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      createdById: userRows.registrar.id,
    },
  });
  await db.guestVisit.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      fullName: "محترمه فرشته کریمی",
      purpose: "پیگیری پروندهٔ شمولیت فرزند",
      hostName: "محترمه نعیمه صمدی",
      visitorCount: 1,
      arrivedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      leftAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      createdById: userRows.registrar.id,
    },
  });

  // ── Discipline & behavior register (Phase 7) ────────────────────────────
  // Fictional incidents + merits spread over the last three months, in BOTH
  // branches, recorded by different roles. Some resolved with follow-up notes.
  if (mainStudents.length >= 4 && secondStudents.length >= 2) {
    await db.disciplineIncident.createMany({
      data: [
        {
          orgId: org.id, branchId: mainBranch.id, studentId: mainStudents[0].student.id,
          date: "2026-09-28", kind: "late", severity: "low",
          description: "سه روز پیوسته با تأخیر به صنف آمد.",
          actionTaken: "counseling", followUpNote: "با ولی تلفنی صحبت شد؛ قول بهبود داده شد.",
          resolvedAt: new Date("2026-10-02T09:00:00Z"), recordedById: userRows.teacher.id,
        },
        {
          orgId: org.id, branchId: mainBranch.id, studentId: mainStudents[1].student.id,
          date: "2026-10-12", kind: "absent", severity: "medium",
          description: "یک هفته بدون رخصت غایب بود.",
          actionTaken: "parent_notified", followUpNote: "ولی به مکتب احضار شد.",
          resolvedAt: new Date("2026-10-15T08:30:00Z"), recordedById: userRows.teacher.id,
        },
        {
          orgId: org.id, branchId: mainBranch.id, studentId: mainStudents[2].student.id,
          date: "2026-10-20", kind: "misconduct", severity: "high",
          description: "در زمان استراحت با هم‌صنف خودش بحث و زد و خورد کرد.",
          actionTaken: "warning", resolvedAt: null,
          recordedById: userRows.manager.id,
        },
        {
          orgId: org.id, branchId: mainBranch.id, studentId: mainStudents[3].student.id,
          date: "2026-10-25", kind: "merit", severity: "low",
          description: "تلفن گم‌شدهٔ هم‌صنف را به اداره تحویل داد.",
          actionTaken: "none", resolvedAt: new Date("2026-10-25T10:00:00Z"),
          recordedById: userRows.teacher.id,
        },
        {
          orgId: org.id, branchId: mainBranch.id, studentId: mainStudents[1].student.id,
          date: "2026-11-02", kind: "dress", severity: "low",
          description: "بدون لباس مکتبی به صنف آمد.",
          actionTaken: "none", resolvedAt: null, recordedById: userRows.teacher.id,
        },
        {
          orgId: org.id, branchId: secondBranch.id, studentId: secondStudents[0].student.id,
          date: "2026-10-08", kind: "damage", severity: "medium",
          description: "شیشهٔ پنجرهٔ صنف را در بازی فوتبال شکاند.",
          actionTaken: "parent_notified", followUpNote: "ولی هزینهٔ شیشه را پرداخت کرد.",
          resolvedAt: new Date("2026-10-11T07:45:00Z"), recordedById: userRows.teacher2.id,
        },
        {
          orgId: org.id, branchId: secondBranch.id, studentId: secondStudents[1].student.id,
          date: "2026-11-01", kind: "merit", severity: "low",
          description: "در مسابقهٔ خطابهٔ مکتب مقام اول را کسب کرد.",
          actionTaken: "none", resolvedAt: new Date("2026-11-01T13:00:00Z"),
          recordedById: userRows.manager2.id,
        },
        {
          orgId: org.id, branchId: secondBranch.id, studentId: secondStudents[0].student.id,
          date: "2026-11-03", kind: "fight", severity: "high",
          description: "در حیاط مکتب با شاگرد صنف دیگر زد و خورد کرد.",
          actionTaken: "suspension", followUpNote: "سه روز از مکتب محروم شد.",
          resolvedAt: null, recordedById: userRows.manager2.id,
        },
      ],
    });
  }

  // ── Event calendar ──────────────────────────────────────────────────────
  await db.schoolEvent.createMany({
    data: [
      {
        orgId: org.id,
        branchId: null, // org-wide — visible in every branch
        title: "امتحانات میان‌ترم نیم‌سال اول",
        kind: "exam",
        startsOn: "2026-11-15",
        endsOn: "2026-11-25",
        createdById: userRows.gm.id,
      },
      {
        orgId: org.id,
        branchId: null,
        title: "رخصتی رسمی — روز استقلال",
        kind: "holiday",
        startsOn: "2026-08-19",
        createdById: userRows.gm.id,
      },
      {
        orgId: org.id,
        branchId: mainBranch.id,
        title: "مراسم توزیع کارت‌های شناسایی",
        kind: "ceremony",
        startsOn: "2026-11-10",
        createdById: userRows.manager.id,
      },
      {
        orgId: org.id,
        branchId: secondBranch.id,
        title: "جلسهٔ کادر شعبهٔ خوشحال خان",
        kind: "meeting",
        startsOn: "2026-11-12",
        createdById: userRows.manager2.id,
      },
    ],
  });

  console.log("✅ Seed complete.");
  console.log("   Demo logins (all fictional):");
  console.log("   admin / Admin1234 (همه شعبه‌ها) · gm / General1234 (مدیر عام — همه شعبه‌ها)");
  console.log("   manager / Manager1234 · registrar / Registrar1234 · finance / Finance1234 (کارتهٔ نو)");
  console.log("   cashier / Cashier1234 · teacher / Teacher1234 (کارتهٔ نو)");
  console.log("   manager2 / Manager1234 · teacher2 / Teacher1234 (شعبهٔ خوشحال خان)");
  console.log("   academic / Academic1234 · librarian / Library1234 · hr / Hr12345678 · auditor / Auditor1234");
  console.log("   walikhal / Parent1234 (ولی با دو فرزند) · shagerd / Student1234 (حساب شاگردی)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
