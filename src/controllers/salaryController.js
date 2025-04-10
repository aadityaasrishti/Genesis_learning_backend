const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { createSalaryNotification } = require("../utils/notificationUtils");
const { getSchoolInfo } = require("../utils/schoolUtils");

// Validation helpers
const validateCommissionRates = (
  salary_type,
  commission_rate,
  class_specific_rates
) => {
  if (salary_type === "COMMISSION_BASED") {
    if (class_specific_rates) {
      try {
        const rates = JSON.parse(class_specific_rates);
        for (const rate of Object.values(rates)) {
          if (rate < 0) {
            throw new Error(
              "Class-specific commission rates cannot be negative"
            );
          }
        }
      } catch (e) {
        throw new Error("Invalid class-specific rates format");
      }
    }
  }
};

// Helper function to compare month strings
const compareMonthStrings = (monthA, monthB) => {
  const [monthAYear, monthAName] = monthA.split(" ");
  const [monthBYear, monthBName] = monthB.split(" ");

  if (monthAYear !== monthBYear) {
    return Number(monthAYear) - Number(monthBYear);
  }

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months.indexOf(monthAName) - months.indexOf(monthBName);
};

const validateDateRange = async (
  teacher_id,
  effective_from,
  effective_until
) => {
  if (!effective_from) {
    throw new Error("Effective from date is required");
  }

  const effectiveFromDate = new Date(effective_from);
  const effectiveFromMonth = effectiveFromDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  let effectiveUntilMonth = null;
  if (effective_until) {
    const effectiveUntilDate = new Date(effective_until);
    if (isNaN(effectiveUntilDate.getTime())) {
      throw new Error("Invalid effective until date");
    }
    if (effectiveUntilDate <= effectiveFromDate) {
      throw new Error("Effective until date must be after effective from date");
    }
    effectiveUntilMonth = effectiveUntilDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  }

  // Get all existing configurations for overlap check
  const existingConfigs = await prisma.teacherSalary.findMany({
    where: {
      teacher_id: parseInt(teacher_id),
    },
    orderBy: {
      effective_from: "asc",
    },
  });

  for (const config of existingConfigs) {
    const configStartMonth = new Date(config.effective_from).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
      }
    );
    const configEndMonth = config.effective_until
      ? new Date(config.effective_until).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        })
      : null;

    // Check if new start month falls within existing range
    if (configEndMonth === null) {
      // If existing config has no end date, any later start month would overlap
      if (compareMonthStrings(effectiveFromMonth, configStartMonth) >= 0) {
        throw new Error(
          "New configuration overlaps with an existing open-ended configuration"
        );
      }
    } else {
      // Check for overlap with start month
      if (
        compareMonthStrings(effectiveFromMonth, configStartMonth) >= 0 &&
        compareMonthStrings(effectiveFromMonth, configEndMonth) <= 0
      ) {
        throw new Error(
          "New configuration's start date overlaps with an existing configuration"
        );
      }

      // If new config has end month, check for that overlap too
      if (effectiveUntilMonth) {
        if (
          compareMonthStrings(effectiveUntilMonth, configStartMonth) >= 0 &&
          compareMonthStrings(effectiveUntilMonth, configEndMonth) <= 0
        ) {
          throw new Error(
            "New configuration's end date overlaps with an existing configuration"
          );
        }
        // Check if new range completely encompasses existing range
        if (
          compareMonthStrings(effectiveFromMonth, configStartMonth) < 0 &&
          compareMonthStrings(effectiveUntilMonth, configEndMonth) > 0
        ) {
          throw new Error(
            "New configuration encompasses an existing configuration"
          );
        }
      }
    }
  }
};

// Validation helper for payment processing
const validateSalaryPayment = async (
  teacherId,
  salaryId,
  amount,
  month,
  paymentMode,
  transactionId
) => {
  // Validate payment amount
  const MAX_SALARY_AMOUNT = 1000000;
  if (amount <= 0 || amount > MAX_SALARY_AMOUNT) {
    throw new Error(`Salary amount must be between 1 and ${MAX_SALARY_AMOUNT}`);
  }

  // Validate payment mode and transaction ID
  if (
    ["ONLINE", "BANK_TRANSFER", "UPI"].includes(paymentMode) &&
    !transactionId
  ) {
    throw new Error("Transaction ID is required for online payments");
  }

  // Check if salary configuration exists and is valid for the payment month
  const salaryConfig = await prisma.teacherSalary.findFirst({
    where: {
      id: salaryId,
      teacher_id: teacherId,
    },
  });

  if (!salaryConfig) {
    throw new Error("Invalid salary configuration");
  }

  const paymentMonth = new Date(month);
  const configStart = new Date(salaryConfig.effective_from);
  const configEnd = salaryConfig.effective_until
    ? new Date(salaryConfig.effective_until)
    : null;

  // Compare only year and month for date range validation
  const isBeforeStart =
    paymentMonth.getFullYear() < configStart.getFullYear() ||
    (paymentMonth.getFullYear() === configStart.getFullYear() &&
      paymentMonth.getMonth() < configStart.getMonth());

  const isAfterEnd =
    configEnd &&
    (paymentMonth.getFullYear() > configEnd.getFullYear() ||
      (paymentMonth.getFullYear() === configEnd.getFullYear() &&
        paymentMonth.getMonth() > configEnd.getMonth()));

  if (isBeforeStart || isAfterEnd) {
    throw new Error(
      "Payment month must be within salary configuration effective dates"
    );
  }

  // Format the month for comparison
  const formattedMonth = month.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  // Check for duplicate payments in the same month
  const existingPayment = await prisma.salaryPayment.findFirst({
    where: {
      teacher_id: teacherId,
      month: formattedMonth,
    },
  });

  if (existingPayment) {
    throw new Error("A payment for this month already exists");
  }
};

// Add school info to payment response
const enrichPaymentResponse = (payment) => {
  const schoolInfo = getSchoolInfo();
  return {
    ...payment,
    school: schoolInfo
  };
};

// Set up or update teacher salary configuration
exports.setTeacherSalary = async (req, res) => {
  console.log("[Salary Config] Starting salary configuration setup:", {
    timestamp: new Date().toISOString(),
    requestBody: {
      ...req.body,
      // Exclude sensitive data if any
      class_specific_rates: req.body.class_specific_rates ? 'Present' : 'Not present'
    }
  });

  try {
    const {
      teacher_id,
      salary_type,
      base_amount,
      class_specific_rates,
      effective_from,
      effective_until,
    } = req.body;

    // Validate teacher exists
    const teacher = await prisma.user.findFirst({
      where: { user_id: teacher_id, role: "teacher", is_active: true },
    });

    console.log("[Salary Config] Teacher validation result:", {
      teacherId: teacher_id,
      found: !!teacher,
      isActive: teacher?.is_active
    });

    if (!teacher) {
      return res
        .status(404)
        .json({ message: "Teacher not found or is not active" });
    }

    // Validate commission rates
    try {
      validateCommissionRates(salary_type, null, class_specific_rates);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    // Find existing open-ended configuration if any
    const existingOpenConfig = await prisma.teacherSalary.findFirst({
      where: {
        teacher_id,
        effective_until: null,
      },
      orderBy: {
        effective_from: "desc",
      },
    });

    // Create new salary configuration
    const newConfig = {
      teacher_id,
      salary_type,
      base_amount: salary_type === "FIXED" ? base_amount : null,
      class_specific_rates:
        salary_type === "COMMISSION_BASED" ? class_specific_rates : null,
      effective_from: new Date(effective_from),
      effective_until: effective_until ? new Date(effective_until) : null,
    };

    // If there's an open-ended config, we'll close it and create the new one
    if (existingOpenConfig) {
      console.log("[Salary Config] Found existing open configuration:", {
        configId: existingOpenConfig.id,
        previousEffectiveFrom: existingOpenConfig.effective_from,
        previousSalaryType: existingOpenConfig.salary_type
      });

      // Start a transaction to handle both updates atomically
      const [closedOldConfig, salary] = await prisma.$transaction([
        // Close the existing configuration
        prisma.teacherSalary.update({
          where: { id: existingOpenConfig.id },
          data: {
            effective_until: new Date(effective_from),
          },
        }),
        // Create the new configuration
        prisma.teacherSalary.create({
          data: newConfig,
        }),
      ]);

      console.log("[Salary Config] Successfully updated configuration:", {
        oldConfigId: closedOldConfig.id,
        newConfigId: salary.id,
        effectiveFrom: effective_from,
        salaryType: salary_type
      });

      // Create notification about the configuration change
      const message = `Your salary configuration has been updated to ${salary_type} type${
        salary_type === "FIXED" ? ` with base amount ₹${base_amount}` : ""
      }${
        salary_type === "COMMISSION_BASED"
          ? ` with commission rates updated for your assigned classes`
          : ""
      } effective from ${new Date(effective_from).toLocaleDateString()}`;
      await createSalaryNotification(teacher_id, message, "salary_update");

      res.json(salary);
    } else {
      console.log("[Salary Config] Creating new configuration without existing open config");
      const salary = await prisma.teacherSalary.create({
        data: newConfig,
      });

      // Create notification
      const message = `Your salary configuration has been updated to ${salary_type} type${
        salary_type === "FIXED" ? ` with base amount ₹${base_amount}` : ""
      }${
        salary_type === "COMMISSION_BASED"
          ? ` with commission rates updated for your assigned classes`
          : ""
      } effective from ${new Date(effective_from).toLocaleDateString()}`;
      await createSalaryNotification(teacher_id, message, "salary_update");

      res.json(salary);
    }
  } catch (error) {
    console.error("[Salary Config] Error in salary configuration:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res
      .status(500)
      .json({ message: error.message || "Error setting teacher salary" });
  }
};

// Calculate commission-based salary
exports.calculateCommissionSalary = async (req, res) => {
  console.log("[Commission Calculation] Starting commission calculation:", {
    timestamp: new Date().toISOString(),
    teacherId: req.body.teacher_id,
    month: req.body.month
  });

  try {
    const { teacher_id, month } = req.body;

    if (!teacher_id || !month) {
      return res.status(400).json({
        message: "Teacher ID and month are required",
        code: "INVALID_REQUEST",
      });
    }

    const monthDate = new Date(month);
    const formattedMonth = monthDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });

    const startDate = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1
    );
    const endDate = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0
    );

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        message: "Invalid date format",
        code: "INVALID_DATE",
      });
    }

    // Get all active salary configurations for this teacher
    const salaryConfigs = await prisma.teacherSalary.findMany({
      where: {
        teacher_id,
        salary_type: "COMMISSION_BASED",
        effective_from: { lte: endDate },
        OR: [
          { effective_until: null },
          { effective_until: { gte: startDate } },
        ],
      },
      orderBy: { effective_from: "desc" },
    });

    console.log("[Commission Calculation] Found salary configurations:", {
      configCount: salaryConfigs.length,
      configIds: salaryConfigs.map(c => c.id),
      period: { startDate, endDate }
    });

    if (!salaryConfigs || salaryConfigs.length === 0) {
      return res.status(404).json({
        message:
          "No active commission-based salary configuration found for this period",
        code: "NO_ACTIVE_COMMISSION_CONFIG",
      });
    }

    const activeConfig = salaryConfigs[0];
    if (!activeConfig.class_specific_rates) {
      return res.status(400).json({
        message:
          "No class-specific commission rates found in the configuration",
        code: "NO_COMMISSION_RATES",
      });
    }

    // Parse class-specific rates and normalize class IDs
    let classRates;
    try {
      const parsedRates = JSON.parse(activeConfig.class_specific_rates);
      // Normalize class IDs by trimming whitespace
      classRates = Object.entries(parsedRates).reduce(
        (acc, [classId, rate]) => {
          acc[classId.trim()] = rate;
          return acc;
        },
        {}
      );
    } catch (e) {
      return res.status(400).json({
        message: "Invalid class-specific rates format in configuration",
        code: "INVALID_RATES_FORMAT",
      });
    }

    // Get teacher's assigned classes and subjects
    const teacher = await prisma.user.findFirst({
      where: {
        user_id: teacher_id,
        role: "teacher",
        is_active: true,
      },
      include: { teacher: true },
    });

    if (!teacher?.teacher) {
      return res.status(404).json({
        message: "Teacher not found or teacher details are missing",
        code: "TEACHER_NOT_FOUND",
      });
    }

    const assignedClasses = teacher.teacher.class_assigned
      ? teacher.teacher.class_assigned
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];
    const assignedSubjects = teacher.teacher.subject
      ? teacher.teacher.subject
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (assignedClasses.length === 0 || assignedSubjects.length === 0) {
      return res.status(400).json({
        message: "Teacher has no assigned classes or subjects",
        code: "NO_ASSIGNMENTS",
      });
    }

    let totalCommission = 0;
    const commissionDetails = {
      classDetails: [],
      totalStudentCount: 0,
      totalCommission: 0,
    };

    // Calculate commission for each assigned class
    for (const classId of assignedClasses) {
      const normalizedClassId = classId.trim();

      // Verify commission rate exists for this class
      if (!classRates[normalizedClassId]) {
        return res.status(400).json({
          message: `No commission rate configured for class ${normalizedClassId}`,
          code: "MISSING_CLASS_RATE",
        });
      }

      const commissionRate = Number(classRates[normalizedClassId]);
      if (isNaN(commissionRate) || commissionRate < 0) {
        return res.status(400).json({
          message: `Invalid commission rate for class ${normalizedClassId}`,
          code: "INVALID_COMMISSION_RATE",
        });
      }

      // Get active students in this class
      const students = await prisma.student.findMany({
        where: {
          class_id: normalizedClassId,
          user: {
            is_active: true,
          },
        },
        include: {
          user: {
            select: {
              name: true,
              subjects: true,
            },
          },
        },
      });

      let classStudentCount = 0;
      const studentDetails = [];

      // Count students per subject in this class
      for (const student of students) {
        if (!student.user?.subjects) continue;

        const studentSubjects = student.user.subjects
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        // Count how many of teacher's subjects this student is enrolled in
        const enrolledSubjectsCount = assignedSubjects.filter((subject) =>
          studentSubjects.includes(subject)
        ).length;

        if (enrolledSubjectsCount > 0) {
          classStudentCount += enrolledSubjectsCount;
          studentDetails.push({
            name: student.user.name,
            subjectCount: enrolledSubjectsCount,
            commission: commissionRate * enrolledSubjectsCount,
          });
        }
      }

      const classCommission = classStudentCount * commissionRate;
      totalCommission += classCommission;

      commissionDetails.classDetails.push({
        classId: normalizedClassId,
        studentCount: classStudentCount,
        commissionRate,
        totalCommission: classCommission,
        students: studentDetails,
      });

      commissionDetails.totalStudentCount += classStudentCount;
    }

    commissionDetails.totalCommission = totalCommission;

    // Log the calculation details
    console.log("[Commission Calculation] Calculation complete:", {
      teacherId: teacher_id,
      month: formattedMonth,
      totalCommission,
      totalStudents: commissionDetails.totalStudentCount,
      classCount: commissionDetails.classDetails.length
    });

    res.json({
      month: formattedMonth,
      commissionDetails,
      calculatedAmount: totalCommission,
    });
  } catch (error) {
    console.error("[Commission Calculation] Error calculating commission:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      message: "Error calculating commission salary",
      error: error.message,
      code: "CALCULATION_ERROR",
    });
  }
};

// Process salary payment
exports.processSalaryPayment = async (req, res) => {
  console.log("[Salary Payment] Starting payment processing:", {
    timestamp: new Date().toISOString(),
    teacherId: req.body.teacher_id,
    salaryId: req.body.salary_id,
    month: req.body.month,
    paymentMode: req.body.payment_mode
  });

  try {
    const {
      teacher_id,
      salary_id,
      amount,
      month,
      payment_mode,
      transaction_id,
      remarks,
      commission_details,
    } = req.body;

    // Convert month to formatted string (e.g., "March 2025")
    const monthDate = new Date(month);
    const formattedMonth = monthDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    const paymentDate = new Date();

    if (monthDate > paymentDate) {
      return res.status(400).json({
        message: "Cannot process payment for future months",
        code: "INVALID_PAYMENT_DATE",
      });
    }

    // Validate payment details
    try {
      await validateSalaryPayment(
        teacher_id,
        salary_id,
        amount,
        monthDate,
        payment_mode,
        transaction_id
      );
    } catch (error) {
      return res.status(400).json({
        message: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    // Verify salary type and commission details match
    const salaryConfig = await prisma.teacherSalary.findUnique({
      where: { id: salary_id },
    });

    console.log("[Salary Payment] Salary configuration verification:", {
      configFound: !!salaryConfig,
      salaryType: salaryConfig?.salary_type,
      hasCommissionDetails: !!commission_details
    });

    if (!salaryConfig) {
      return res.status(404).json({
        message: "Salary configuration not found",
        code: "INVALID_SALARY_CONFIG",
      });
    }

    // Create the payment with commission details if applicable
    const payment = await prisma.salaryPayment.create({
      data: {
        teacher_id,
        salary_id,
        amount,
        month: formattedMonth,
        payment_date: paymentDate,
        payment_mode,
        payment_status: "PAID",
        transaction_id,
        remarks,
        commission_details:
          salaryConfig.salary_type === "COMMISSION_BASED"
            ? commission_details
            : null,
      },
      include: {
        teacher_salary: true,
        teacher: {
          select: {
            name: true,
          },
        },
      },
    });

    console.log("[Salary Payment] Payment processed successfully:", {
      paymentId: payment.id,
      teacherId: teacher_id,
      amount,
      month: formattedMonth,
      status: payment.payment_status,
      commissionDetails: payment.commission_details
    });

    // Create notification
    const message = `Your salary payment of ₹${amount} for ${formattedMonth} has been processed via ${payment_mode.replace(
      "_",
      " "
    )}`;
    await createSalaryNotification(teacher_id, message, "salary_payment");

    res.json(enrichPaymentResponse(payment));
  } catch (error) {
    console.error("[Salary Payment] Error processing payment:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      message: "Error processing salary payment",
      error: error.message,
    });
  }
};

// Get salary history for a teacher
exports.getTeacherSalaryHistory = async (req, res) => {
  try {
    const { teacher_id } = req.params;
    const { start_date, end_date } = req.query;

    console.log("[Salary History] Starting history fetch:", {
      teacherId: teacher_id,
      dateRange: { start_date, end_date }
    });

    // First fetch all payments for this teacher
    const allPayments = await prisma.salaryPayment.findMany({
      where: {
        teacher_id: parseInt(teacher_id),
      },
      include: {
        teacher_salary: true,
        teacher: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ payment_date: "desc" }],
    });

    console.log("[Salary History] All payments fetched:", {
      teacherId: teacher_id,
      totalPayments: allPayments.length,
      payments: allPayments.map(p => ({
        id: p.id,
        paymentDate: p.payment_date,
        month: p.month
      }))
    });

    // If no date range specified, return all payments
    if (!start_date || !end_date) {
      return res.json(allPayments);
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Validate date range
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        message: "Invalid date format",
        code: "INVALID_DATE"
      });
    }

    // Filter payments by date range
    const filteredPayments = allPayments.filter(payment => {
      // Check payment date
      const paymentDate = new Date(payment.payment_date);
      if (paymentDate >= startDate && paymentDate <= endDate) {
        return true;
      }

      // Check payment month
      const [monthName, yearStr] = payment.month.split(" ");
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const monthIndex = months.indexOf(monthName);
      const year = parseInt(yearStr);

      const paymentMonthDate = new Date(year, monthIndex);
      const startMonthDate = new Date(startDate.getFullYear(), startDate.getMonth());
      const endMonthDate = new Date(endDate.getFullYear(), endDate.getMonth());

      return paymentMonthDate >= startMonthDate && paymentMonthDate <= endMonthDate;
    });

    console.log("[Salary History] Filtered payments:", {
      teacherId: teacher_id,
      dateRange: { startDate, endDate },
      totalPayments: allPayments.length,
      filteredCount: filteredPayments.length,
      filteredPayments: filteredPayments.map(p => ({
        id: p.id,
        paymentDate: p.payment_date,
        month: p.month
      }))
    });

    res.json(filteredPayments);
  } catch (error) {
    console.error("[Salary History] Error fetching salary history:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      message: "Error fetching salary history",
      error: error.message,
    });
  }
};

// Get current salary configuration
exports.getCurrentSalaryConfig = async (req, res) => {
  try {
    const { teacher_id } = req.params;

    // First check if the teacher exists
    const teacher = await prisma.user.findFirst({
      where: {
        user_id: parseInt(teacher_id),
        role: "teacher",
        is_active: true,
      },
      include: {
        teacher: true,
      },
    });

    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found or is not active",
        code: "TEACHER_NOT_FOUND",
      });
    }

    // Find ALL salary configurations for this teacher, ordered by effective_from date
    const configs = await prisma.teacherSalary.findMany({
      where: {
        teacher_id: parseInt(teacher_id),
      },
      orderBy: {
        effective_from: "desc",
      },
    });

    if (configs.length === 0) {
      return res.status(404).json({
        message:
          "No salary configuration found. Please set up a salary configuration first.",
        code: "NO_SALARY_CONFIG",
      });
    }

    // Find the active configuration for the current date
    const now = new Date();
    const activeConfig = configs.find((config) => {
      const effectiveFrom = new Date(config.effective_from);
      const effectiveUntil = config.effective_until
        ? new Date(config.effective_until)
        : null;

      return effectiveFrom <= now && (!effectiveUntil || effectiveUntil >= now);
    });

    // If no active config found, return the most recent configuration
    const currentConfig = activeConfig || configs[0];

    // Log the configuration being used
    console.log("Using salary configuration:", {
      configId: currentConfig.id,
      teacherId: currentConfig.teacher_id,
      type: currentConfig.salary_type,
      baseAmount: currentConfig.base_amount,
      commissionRate: currentConfig.commission_rate,
      effectiveFrom: currentConfig.effective_from,
      effectiveUntil: currentConfig.effective_until,
      isActive: !!activeConfig,
    });

    res.json(currentConfig);
  } catch (error) {
    console.error("Error fetching current salary configuration:", error);
    res.status(500).json({
      message: "Error fetching current salary configuration",
      error: error.message,
    });
  }
};

// Get teachers for salary configuration
exports.getTeachersForSalary = async (req, res) => {
  try {
    const teachers = await prisma.user.findMany({
      where: {
        role: "teacher",
        is_active: true,
      },
      include: {
        teacher: {
          select: {
            subject: true,
            class_assigned: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const formattedTeachers = teachers.map((teacher) => ({
      user_id: teacher.user_id,
      name: teacher.name,
      subject: teacher.teacher?.subject || "",
      class_assigned: teacher.teacher?.class_assigned || "",
    }));

    res.json(formattedTeachers);
  } catch (error) {
    console.error("Error fetching teachers for salary:", error);
    res.status(500).json({
      message: "Failed to fetch teachers",
      error: error.message,
    });
  }
};
