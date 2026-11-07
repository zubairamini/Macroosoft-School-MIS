#!/usr/bin/env python3
"""Patch prisma/seed.ts: staff salaries + second-branch staff/teaching/
timetable/attendance/assessment + Phase 3 finance demo data."""

path = "/home/z/my-project/prisma/seed.ts"
src = open(path, encoding="utf-8").read()

def must_replace(old, new, count=1):
    global src
    assert old in src, f"anchor not found: {old[:80]!r}"
    src = src.replace(old, new, count)

# ── 1) salaries on khaled / nargis / akmal ──────────────────────────────────
must_replace(
    """      hireDate: "2022-03-01",
      employmentType: "full_time",
      status: "active",
    },
  });
  const nargis = await db.staffMember.create({""",
    """      hireDate: "2022-03-01",
      employmentType: "full_time",
      status: "active",
      salaryDiram: 45_000 * 100,
    },
  });
  const nargis = await db.staffMember.create({""",
)
must_replace(
    """      hireDate: "2023-03-01", employmentType: "full_time", status: "active",
    },
  });""",
    """      hireDate: "2023-03-01", employmentType: "full_time", status: "active",
      salaryDiram: 40_000 * 100,
    },
  });""",
)
must_replace(
    """      hireDate: "2021-09-01", employmentType: "full_time", status: "active",
    },
  });""",
    """      hireDate: "2021-09-01", employmentType: "full_time", status: "active",
      salaryDiram: 42_000 * 100,
    },
  });""",
)

# ── 2) admin staff salaries + second-branch staff ───────────────────────────
must_replace(
    'position: "admin_staff", qualification: "لیسانس مدیریت" },',
    'position: "admin_staff", qualification: "لیسانس مدیریت", salary: 60_000 },',
)
must_replace(
    'position: "admin_staff", qualification: "لیسانس تعلیم و تربیه" },',
    'position: "admin_staff", qualification: "لیسانس تعلیم و تربیه", salary: 55_000 },',
)
must_replace(
    'position: "admin_staff", qualification: "دیپلم حسابداری و ثبت" },',
    'position: "admin_staff", qualification: "دیپلم حسابداری و ثبت", salary: 35_000 },',
)
must_replace(
    'position: "admin_staff", qualification: "لیسانس اقتصاد" },',
    'position: "admin_staff", qualification: "لیسانس اقتصاد", salary: 38_000 },',
)
must_replace(
    'position: "support", qualification: "دیپلم لیسه" },',
    'position: "support", qualification: "دیپلم لیسه", salary: 30_000 },',
)
must_replace(
    """        position: s.position, qualification: s.qualification,
        hireDate: "2022-03-01", employmentType: "full_time", status: "active",
      },
    });
  }""",
    """        position: s.position, qualification: s.qualification,
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
  });""",
)

# ── 3) second-branch academic data, inserted after the main attendance loop ─
anchor = """    // Today's session still open (demonstrates the record → submit flow).
    await db.attendanceSession.create({
      data: {
        classSectionId: sections[key].id,
        date: "2026-11-06",
        period: 0,
        status: "open",
        recordedById: khaled.id,
      },
    });
  }"""
second_branch_block = anchor + """

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
  });"""
must_replace(anchor, second_branch_block)

# ── 4) Phase 3 finance demo data before the final log ───────────────────────
log_anchor = '  console.log("✅ Seed complete.")'
finance_block = '''  // ── Phase 3: fees & finance ───────────────────────────────────────────
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
  interface SeedInv { student: { id: string; studentNumber: string }; branchId: string; fee: { id: string; amountDiram: number }; periodKey: string; periodLabel: string; dueDate: string | null; }
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
        invoiceNumber: `F-1405-${String(invoiceSeq).padStart(4, "0")}`,
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
    invoiceRows.push({ id: row.id, netDiram, paidDiram: 0, studentId: t.studentId, branchId: t.branchId, periodKey: t.periodKey });
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
        receiptNumber: `R-1405-${String(receiptSeq).padStart(4, "0")}`,
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
        expenseNumber: `E-1405-${String(expenseSeq).padStart(4, "0")}`,
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
    let slip = 0;
    const items: Array<{ staffId: string; base: number; allowance: number; deduction: number }> = [];
    for (const s of staff) {
      slip += 1;
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
          expenseNumber: `E-1405-${String(expenseSeq).padStart(4, "0")}`,
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
      { key: `applicant:${year1405.name}`, value: appSeq },
      { key: `student:${year1405.name}`, value: studentSeq },
      { key: "invoice:1405", value: invoiceSeq },
      { key: "receipt:1405", value: receiptSeq },
      { key: "expense:1405", value: expenseSeq },
      { key: "payslip:1405-07", value: 20 },
      { key: "payslip:1405-08", value: 20 },
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

'''
must_replace(log_anchor, finance_block + log_anchor)

# ── 5) final log with the new accounts ──────────────────────────────────────
must_replace(
    """  console.log("   admin / Admin1234 · manager / Manager1234 · registrar / Registrar1234");
  console.log("   academic / Academic1234 · teacher / Teacher1234 · finance / Finance1234");
  console.log("   cashier / Cashier1234 · librarian / Library1234 · hr / Hr12345678");
  console.log("   auditor / Auditor1234 · walikhal / Parent1234 (ولی با دو فرزند)");
  console.log("   shagerd / Student1234 (حساب شاگردی)");""",
    """  console.log("   admin / Admin1234 (همه شعبه‌ها) · gm / General1234 (مدیر عام — همه شعبه‌ها)");
  console.log("   manager / Manager1234 · registrar / Registrar1234 · finance / Finance1234 (کارتهٔ نو)");
  console.log("   cashier / Cashier1234 · teacher / Teacher1234 (کارتهٔ نو)");
  console.log("   manager2 / Manager1234 · teacher2 / Teacher1234 (شعبهٔ خوشحال خان)");
  console.log("   academic / Academic1234 · librarian / Library1234 · hr / Hr12345678 · auditor / Auditor1234");
  console.log("   walikhal / Parent1234 (ولی با دو فرزند) · shagerd / Student1234 (حساب شاگردی)");""",
)

open(path, "w", encoding="utf-8").write(src)
print("✅ seed patched: branches, staff salaries, second-branch data, Phase 3 finance")
