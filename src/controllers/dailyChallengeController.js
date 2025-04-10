const { prisma } = require("../config/prisma");

// Create a new daily challenge
exports.createDailyChallenge = async (req, res) => {
  const startTime = Date.now();
  try {
    const { class_id, subject, title, questions } = req.body;
    const teacher_id = req.user.user_id;

    console.log("[DailyChallenge] Creating new challenge:", {
      teacher_id,
      class_id,
      subject,
      title,
      questionCount: questions?.length,
      timestamp: new Date().toISOString(),
    });

    // Validate input
    if (
      !class_id ||
      !subject ||
      !title ||
      !questions ||
      !Array.isArray(questions)
    ) {
      console.warn("[DailyChallenge] Invalid input received:", {
        class_id,
        subject,
        title,
        questions,
      });
      return res
        .status(400)
        .json({ error: "Missing or invalid required fields" });
    }

    // Validate questions format
    for (const q of questions) {
      if (!q.question || !q.type || !["MCQ", "SUBJECTIVE"].includes(q.type)) {
        console.warn("[DailyChallenge] Invalid question format:", q);
        return res.status(400).json({ error: "Invalid question format" });
      }
      if (
        q.type === "MCQ" &&
        (!Array.isArray(q.options) ||
          q.options.length < 2 ||
          typeof q.correctAnswer !== "number")
      ) {
        console.warn("[DailyChallenge] Invalid MCQ format:", {
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
        });
        return res.status(400).json({ error: "Invalid MCQ question format" });
      }
    }

    const challenge = await prisma.dailyChallenge.create({
      data: {
        teacher_id,
        class_id,
        subject,
        title,
        questions: JSON.stringify(questions),
        date: new Date(),
      },
    });

    console.log("[DailyChallenge] Challenge created successfully:", {
      id: challenge.id,
      duration: Date.now() - startTime,
    });

    // Notify students in this class
    const students = await prisma.student.findMany({
      where: {
        class_id,
        subjects: {
          contains: subject,
        },
      },
      select: {
        user_id: true,
      },
    });

    console.log("[DailyChallenge] Notifying students:", {
      challengeId: challenge.id,
      studentCount: students.length,
    });

    // Create notifications for students
    await prisma.notification.createMany({
      data: students.map((student) => ({
        user_id: student.user_id,
        message: `New daily challenge available for ${subject}: ${title}`,
        type: "daily_challenge",
      })),
    });

    res.status(201).json(challenge);
  } catch (error) {
    console.error("[DailyChallenge] Error creating challenge:", {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to create daily challenge" });
  }
};

// Get daily challenges for a student
exports.getStudentChallenges = async (req, res) => {
  const startTime = Date.now();
  try {
    const { date, subject } = req.query;
    console.log("[DailyChallenge] Fetching student challenges:", {
      studentId: req.user.user_id,
      date,
      subject,
    });

    const student = await prisma.student.findUnique({
      where: { user_id: req.user.user_id },
      select: { class_id: true, subjects: true },
    });

    if (!student) {
      console.warn("[DailyChallenge] Student not found:", req.user.user_id);
      return res.status(404).json({ error: "Student not found" });
    }

    // By default, show only today's challenges
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where = {
      class_id: student.class_id,
      ...(date
        ? {
            date: {
              gte: new Date(date),
              lt: new Date(
                new Date(date).setDate(new Date(date).getDate() + 1)
              ),
            },
          }
        : { date: { gte: today, lt: tomorrow } }),
      ...(subject && { subject }),
    };

    console.log("[DailyChallenge] Query conditions:", where);

    const challenges = await prisma.dailyChallenge.findMany({
      where,
      include: {
        submissions: {
          where: { student_id: req.user.user_id },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    console.log("[DailyChallenge] Challenges retrieved:", {
      studentId: req.user.user_id,
      count: challenges.length,
      duration: Date.now() - startTime,
    });

    // Format response to include attempt status
    const formattedChallenges = challenges.map((challenge) => ({
      ...challenge,
      questions: JSON.parse(challenge.questions),
      attempted: challenge.submissions.length > 0,
      score: challenge.submissions[0]?.score,
      submittedAnswers: challenge.submissions[0]?.answers
        ? JSON.parse(challenge.submissions[0].answers)
        : [],
      submittedAt: challenge.submissions[0]?.submitted_at,
    }));

    res.json(formattedChallenges);
  } catch (error) {
    console.error("[DailyChallenge] Error fetching student challenges:", {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
};

// Submit a challenge attempt
exports.submitChallenge = async (req, res) => {
  const startTime = Date.now();
  try {
    const { challenge_id, answers } = req.body;
    const student_id = req.user.user_id;

    console.log("[DailyChallenge] Processing challenge submission:", {
      challenge_id,
      student_id,
      answerCount: answers?.length,
    });

    // Validate input
    if (!challenge_id || !answers || !Array.isArray(answers)) {
      console.warn("[DailyChallenge] Invalid submission data:", {
        challenge_id,
        answers,
      });
      return res
        .status(400)
        .json({ error: "Missing or invalid required fields" });
    }

    // Get challenge to check time limit and calculate score
    const challenge = await prisma.dailyChallenge.findUnique({
      where: { id: parseInt(challenge_id) },
    });

    if (!challenge) {
      console.warn("[DailyChallenge] Challenge not found:", challenge_id);
      return res.status(404).json({ error: "Challenge not found" });
    }

    // Check submission time limit (12 hours)
    const challengeTime = new Date(challenge.date);
    const now = new Date();
    const hoursDifference =
      (now.getTime() - challengeTime.getTime()) / (1000 * 60 * 60);

    if (hoursDifference > 12) {
      console.warn("[DailyChallenge] Submission time expired:", {
        challenge_id,
        challengeTime,
        submissionTime: now,
        hoursDifference,
      });
      return res.status(400).json({
        error:
          "Challenge submission time has expired. Submissions are only allowed within 12 hours of challenge creation.",
      });
    }

    // Check if already attempted
    const existingSubmission = await prisma.dailyChallengeSubmission.findFirst({
      where: {
        challenge_id: parseInt(challenge_id),
        student_id,
      },
    });

    if (existingSubmission) {
      console.warn("[DailyChallenge] Duplicate submission attempt:", {
        challenge_id,
        student_id,
        existing_submission_id: existingSubmission.id,
      });
      return res.status(400).json({ error: "Challenge already attempted" });
    }

    const questions = JSON.parse(challenge.questions);
    let score = null;

    // Calculate score for MCQ questions
    const mcqQuestions = questions.filter((q) => q.type === "MCQ");
    if (mcqQuestions.length > 0) {
      const correctAnswers = answers.filter((answer, index) => {
        const question = questions[answer.questionIndex];
        return (
          question.type === "MCQ" && answer.answer === question.correctAnswer
        );
      }).length;
      score = (correctAnswers / mcqQuestions.length) * 100;
    }

    const submission = await prisma.dailyChallengeSubmission.create({
      data: {
        challenge_id: parseInt(challenge_id),
        student_id,
        answers: JSON.stringify(answers),
        score,
      },
    });

    console.log("[DailyChallenge] Submission successful:", {
      submission_id: submission.id,
      score,
      duration: Date.now() - startTime,
    });

    res.status(201).json(submission);
  } catch (error) {
    console.error("[DailyChallenge] Error submitting challenge:", {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to submit challenge" });
  }
};

// Get teacher's created challenges
exports.getTeacherChallenges = async (req, res) => {
  const startTime = Date.now();
  try {
    const { date } = req.query;
    const teacher_id = req.user.user_id;

    console.log("[DailyChallenge] Fetching teacher challenges:", {
      teacher_id,
      date,
    });

    const where = {
      teacher_id,
      ...(date
        ? {
            date: {
              gte: new Date(date),
              lt: new Date(
                new Date(date).setDate(new Date(date).getDate() + 1)
              ),
            },
          }
        : {}),
    };

    const challenges = await prisma.dailyChallenge.findMany({
      where,
      include: {
        submissions: {
          include: {
            student: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    console.log("[DailyChallenge] Teacher challenges retrieved:", {
      count: challenges.length,
      duration: Date.now() - startTime,
    });

    // Format response to include submission stats
    const formattedChallenges = challenges.map((challenge) => ({
      ...challenge,
      questions: JSON.parse(challenge.questions),
      submissions: challenge.submissions.map((sub) => ({
        ...sub,
        answers: JSON.parse(sub.answers),
      })),
      submissionCount: challenge.submissions.length,
    }));

    res.json(formattedChallenges);
  } catch (error) {
    console.error("[DailyChallenge] Error fetching teacher challenges:", {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
};

// Get all daily challenges for admin
exports.getAdminChallenges = async (req, res) => {
  const startTime = Date.now();
  try {
    const { date, class_id, subject } = req.query;

    const where = {
      ...(date
        ? {
            date: {
              gte: new Date(date),
              lt: new Date(
                new Date(date).setDate(new Date(date).getDate() + 1)
              ),
            },
          }
        : {}),
      ...(class_id && { class_id }),
      ...(subject && { subject }),
    };

    const challenges = await prisma.dailyChallenge.findMany({
      where,
      include: {
        submissions: {
          include: {
            student: {
              select: {
                name: true,
              },
            },
          },
        },
        teacher: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    const formattedChallenges = challenges.map((challenge) => ({
      ...challenge,
      questions: JSON.parse(challenge.questions),
      submissions: challenge.submissions.map((sub) => ({
        ...sub,
        answers: JSON.parse(sub.answers),
      })),
      submissionCount: challenge.submissions.length,
    }));

    res.json(formattedChallenges);
  } catch (error) {
    console.error("[DailyChallenge] Error fetching admin challenges:", {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
};

// Add grading function for subjective answers
exports.gradeSubjectiveAnswer = async (req, res) => {
  const startTime = Date.now();
  try {
    const { submission_id, score } = req.body;
    const teacher_id = req.user.user_id;

    // Validate input
    if (
      !submission_id ||
      typeof score !== "number" ||
      score < 0 ||
      score > 100
    ) {
      return res.status(400).json({ error: "Invalid grade data" });
    }

    // Check if submission exists and teacher has access
    const submission = await prisma.dailyChallengeSubmission.findFirst({
      where: {
        id: parseInt(submission_id),
        challenge: {
          teacher_id,
        },
      },
      include: {
        challenge: true,
      },
    });

    if (!submission) {
      return res
        .status(404)
        .json({ error: "Submission not found or unauthorized" });
    }

    // Update submission score
    const updatedSubmission = await prisma.dailyChallengeSubmission.update({
      where: { id: parseInt(submission_id) },
      data: { score },
    });

    res.json(updatedSubmission);
  } catch (error) {
    console.error("[DailyChallenge] Error grading submission:", {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });
    res.status(500).json({ error: "Failed to grade submission" });
  }
};
