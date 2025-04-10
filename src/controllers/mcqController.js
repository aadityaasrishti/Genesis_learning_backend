const { prisma } = require("../config/prisma");
const fs = require("fs").promises;
const path = require("path");

// Create a new MCQ question
exports.createMCQQuestion = async (req, res) => {
  try {
    const {
      class_id,
      subject,
      chapter,
      question_text,
      options,
      correct_answer,
    } = req.body;
    const teacher_id = req.user.user_id;

    let image_url = null;
    if (req.file) {
      const uploadDir = path.join(__dirname, "../../uploads/mcq-images");
      await fs.mkdir(uploadDir, { recursive: true });

      const fileName = `${Date.now()}-${req.file.originalname}`;
      await fs.writeFile(path.join(uploadDir, fileName), req.file.buffer);
      image_url = `/uploads/mcq-images/${fileName}`;
    }

    const question = await prisma.mCQQuestion.create({
      data: {
        class_id,
        subject,
        chapter,
        question_text,
        image_url,
        options: JSON.stringify(options),
        correct_answer: parseInt(correct_answer, 10),
        created_by: teacher_id,
      },
    });

    res.json(question);
  } catch (error) {
    console.error("Error creating MCQ question:", error);
    res.status(500).json({ error: "Failed to create MCQ question" });
  }
};

// Bulk create MCQ questions
exports.bulkCreateMCQQuestions = async (req, res) => {
  try {
    const { questions } = req.body;
    const teacher_id = req.user.user_id;
    const files = req.files || [];

    const uploadDir = path.join(__dirname, "../../uploads/mcq-images");
    await fs.mkdir(uploadDir, { recursive: true });

    const createdQuestions = await prisma.$transaction(
      questions.map(async (q, index) => {
        let image_url = null;
        if (files[index]) {
          const fileName = `${Date.now()}-${files[index].originalname}`;
          await fs.writeFile(path.join(uploadDir, fileName), files[index].buffer);
          image_url = `/uploads/mcq-images/${fileName}`;
        }

        return prisma.mCQQuestion.create({
          data: {
            ...q,
            image_url,
            options: JSON.stringify(q.options),
            correct_answer: parseInt(q.correct_answer, 10),
            created_by: teacher_id,
          },
        });
      })
    );

    res.json(createdQuestions);
  } catch (error) {
    console.error("Error bulk creating MCQ questions:", error);
    res.status(500).json({ error: "Failed to create MCQ questions" });
  }
};

// Get MCQ questions by class, subject and chapter
exports.getMCQQuestions = async (req, res) => {
  try {
    const { class_id, subject, chapter } = req.query;

    const questions = await prisma.mCQQuestion.findMany({
      where: {
        class_id,
        subject,
        ...(chapter && { chapter }),
      },
    });

    res.json(
      questions.map((q) => ({
        ...q,
        options: JSON.parse(q.options),
      }))
    );
  } catch (error) {
    console.error("Error fetching MCQ questions:", error);
    res.status(500).json({ error: "Failed to fetch MCQ questions" });
  }
};

// Get available chapters for a class and subject
exports.getChapters = async (req, res) => {
  try {
    const { class_id, subject } = req.query;

    const questions = await prisma.mCQQuestion.findMany({
      where: {
        class_id,
        subject,
      },
      select: {
        chapter: true,
      },
      distinct: ["chapter"],
    });

    const chapters = questions.map((q) => q.chapter);
    res.json(chapters);
  } catch (error) {
    console.error("Error fetching chapters:", error);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
};

// Start a new MCQ session
exports.startMCQSession = async (req, res) => {
  try {
    const { class_id, subject, chapter } = req.body;
    const student_id = req.user.user_id;

    // Get all questions for this combination
    const questions = await prisma.mCQQuestion.findMany({
      where: { class_id, subject, chapter },
      orderBy: { id: "asc" },
    });

    if (questions.length === 0) {
      return res
        .status(404)
        .json({ error: "No questions found for this combination" });
    }

    // Get or create student progress
    let progress = await prisma.studentProgress.findUnique({
      where: {
        student_id_class_id_subject_chapter: {
          student_id,
          class_id,
          subject,
          chapter,
        },
      },
    });

    if (!progress) {
      progress = await prisma.studentProgress.create({
        data: {
          student_id,
          class_id,
          subject,
          chapter,
          last_question_index: 0,
          last_attempted: new Date(),
        },
      });
    }

    // Calculate next batch of questions
    let startIndex = progress.last_question_index;
    const BATCH_SIZE = 10;

    // If we've reached the end, start over
    if (startIndex >= questions.length) {
      startIndex = 0;
    }

    const endIndex = Math.min(startIndex + BATCH_SIZE, questions.length);
    const sessionQuestions = questions.slice(startIndex, endIndex);
    const nextIndex = endIndex >= questions.length ? 0 : endIndex;

    // Create new session
    const session = await prisma.mCQSession.create({
      data: {
        student_id,
        class_id,
        subject,
        chapter,
        start_time: new Date(),
        correct_count: 0,
        incorrect_count: 0,
        skipped_count: 0,
        last_question_index: nextIndex,
        duration: 0,
        questions: {
          create: sessionQuestions.map((q) => ({
            question: { connect: { id: q.id } },
          })),
        },
      },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
    });

    // Format questions with parsed options and proper image URLs
    const formattedQuestions = session.questions.map((sq) => ({
      ...sq,
      question: {
        ...sq.question,
        options: JSON.parse(sq.question.options),
        image_url: sq.question.image_url ? `${req.protocol}://${req.get('host')}${sq.question.image_url}` : null
      },
    }));

    res.json({
      ...session,
      questions: formattedQuestions,
      totalQuestions: questions.length,
      currentBatchSize: sessionQuestions.length,
      remainingQuestions: questions.length - nextIndex,
    });
  } catch (error) {
    console.error("Error starting MCQ session:", error);
    res.status(500).json({ error: "Failed to start MCQ session" });
  }
};

// Submit answer for a question in session
exports.submitAnswer = async (req, res) => {
  try {
    const { session_id, question_id, selected_answer } = req.body;

    // Get the question to check answer
    const sessionQuestion = await prisma.mCQSessionQuestion.findFirst({
      where: {
        session_id: parseInt(session_id),
        question_id: parseInt(question_id),
      },
      include: {
        question: true,
      },
    });

    if (!sessionQuestion) {
      return res.status(404).json({ error: "Question not found in session" });
    }

    // If selected_answer is null, this is a skip - don't update counts
    if (selected_answer === null) {
      await prisma.mCQSessionQuestion.update({
        where: {
          id: sessionQuestion.id,
        },
        data: {
          selected_answer: null,
          is_correct: null,
          answered_at: new Date(),
        },
      });

      res.json({ isSkipped: true });
      return;
    }

    // Check if answer is correct
    const isCorrect =
      selected_answer === sessionQuestion.question.correct_answer;

    // Update session question with answer
    await prisma.$transaction([
      prisma.mCQSessionQuestion.update({
        where: {
          id: sessionQuestion.id,
        },
        data: {
          selected_answer,
          is_correct: isCorrect,
          answered_at: new Date(),
        },
      }),
      prisma.mCQSession.update({
        where: {
          id: parseInt(session_id),
        },
        data: {
          [isCorrect ? "correct_count" : "incorrect_count"]: {
            increment: 1,
          },
        },
      }),
    ]);

    res.json({ isCorrect });
  } catch (error) {
    console.error("Error submitting answer:", error);
    res.status(500).json({ error: "Failed to submit answer" });
  }
};

// End MCQ session
exports.endSession = async (req, res) => {
  try {
    const { session_id } = req.body;
    const session = await prisma.mCQSession.findUnique({
      where: { id: parseInt(session_id) },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Calculate duration
    const duration = Math.round(
      (new Date() - new Date(session.start_time)) / 1000
    );

    // Only count questions that were actually attempted
    const attemptedQuestions = session.questions.filter(
      (q) => q.answered_at !== null
    );
    const skippedCount = attemptedQuestions.filter(
      (q) => q.selected_answer === null
    ).length;
    const correctCount = attemptedQuestions.filter(
      (q) => q.is_correct === true
    ).length;
    const incorrectCount = attemptedQuestions.filter(
      (q) => q.is_correct === false
    ).length;

    // Update session with end time, duration and counts
    const updatedSession = await prisma.mCQSession.update({
      where: { id: parseInt(session_id) },
      data: {
        end_time: new Date(),
        duration,
        correct_count: correctCount,
        incorrect_count: incorrectCount,
        skipped_count: skippedCount,
      },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
    });

    // Format response
    const formattedQuestions = updatedSession.questions.map((sq) => ({
      ...sq,
      question: {
        ...sq.question,
        options: JSON.parse(sq.question.options),
      },
    }));

    res.json({
      ...updatedSession,
      questions: formattedQuestions,
    });
  } catch (error) {
    console.error("Error ending MCQ session:", error);
    res.status(500).json({ error: "Failed to end session" });
  }
};

// Get session results
exports.getSessionResults = async (req, res) => {
  try {
    const { session_id } = req.params;

    const session = await prisma.mCQSession.findUnique({
      where: { id: parseInt(session_id) },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Format questions with parsed options and proper image URLs
    const formattedQuestions = session.questions.map((sq) => ({
      ...sq,
      question: {
        ...sq.question,
        options: JSON.parse(sq.question.options),
        image_url: sq.question.image_url ? `${req.protocol}://${req.get('host')}${sq.question.image_url}` : null
      },
    }));

    res.json({
      ...session,
      questions: formattedQuestions,
    });
  } catch (error) {
    console.error("Error fetching session results:", error);
    res.status(500).json({ error: "Failed to fetch session results" });
  }
};

// Get all sessions for a student
exports.getStudentSessions = async (req, res) => {
  try {
    const student_id = req.user.user_id;

    const sessions = await prisma.mCQSession.findMany({
      where: {
        student_id,
      },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
      orderBy: {
        start_time: "desc",
      },
    });

    // Format questions with parsed options and proper image URLs
    const formattedSessions = sessions.map((session) => ({
      ...session,
      questions: session.questions.map((sq) => ({
        ...sq,
        question: {
          ...sq.question,
          options: JSON.parse(sq.question.options),
          image_url: sq.question.image_url ? `${req.protocol}://${req.get('host')}${sq.question.image_url}` : null
        },
      })),
    }));

    res.json(formattedSessions);
  } catch (error) {
    console.error("Error fetching student sessions:", error);
    res.status(500).json({ error: "Failed to fetch student sessions" });
  }
};

// Get student progress for a subject and chapter
exports.getStudentProgress = async (req, res) => {
  try {
    const { class_id, subject, chapter } = req.query;
    const student_id = req.user.user_id;

    const progress = await prisma.studentProgress.findUnique({
      where: {
        student_id_class_id_subject_chapter: {
          student_id,
          class_id,
          subject,
          chapter,
        },
      },
    });

    res.json(
      progress || { last_question_index: 0, last_attempted: new Date() }
    );
  } catch (error) {
    console.error("Error fetching student progress:", error);
    res.status(500).json({ error: "Failed to fetch student progress" });
  }
};

// Get all sessions for a teacher
exports.getTeacherSessions = async (req, res) => {
  try {
    const teacher_id = req.user.user_id;

    // Get teacher's assigned classes and subjects
    const teacher = await prisma.teacher.findUnique({
      where: { user_id: teacher_id },
      select: {
        class_assigned: true,
        subject: true,
      },
    });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    const teacherClasses = teacher.class_assigned
      ? teacher.class_assigned.split(",").map((c) => c.trim())
      : [];
    const teacherSubjects = teacher.subject
      ? teacher.subject.split(",").map((s) => s.trim())
      : [];

    // Get all sessions for teacher's assigned classes and subjects
    const sessions = await prisma.mCQSession.findMany({
      where: {
        AND: [
          { class_id: { in: teacherClasses } },
          { subject: { in: teacherSubjects } },
        ],
      },
      include: {
        student: {
          select: {
            name: true,
          },
        },
        questions: {
          include: {
            question: true,
          },
        },
      },
      orderBy: {
        start_time: "desc",
      },
    });

    // Format questions with parsed options and proper image URLs
    const formattedSessions = sessions.map((session) => ({
      ...session,
      questions: session.questions.map((sq) => ({
        ...sq,
        question: {
          ...sq.question,
          options: JSON.parse(sq.question.options),
          image_url: sq.question.image_url ? `${req.protocol}://${req.get('host')}${sq.question.image_url}` : null
        },
      })),
    }));

    res.json(formattedSessions);
  } catch (error) {
    console.error("Error fetching teacher sessions:", error);
    res.status(500).json({ error: "Failed to fetch teacher sessions" });
  }
};

// Get statistics for a specific class and subject
exports.getClassStatistics = async (req, res) => {
  try {
    const { class_id, subject } = req.query;

    const sessions = await prisma.mCQSession.findMany({
      where: {
        class_id,
        subject,
        end_time: { not: null }, // Only completed sessions
      },
      include: {
        questions: true,
        student: {
          select: {
            name: true,
          },
        },
      },
    });

    const stats = {
      totalSessions: sessions.length,
      averageScore: 0,
      averageCompletion: 0,
      totalStudents: new Set(sessions.map((s) => s.student_id)).size,
      chapterWisePerformance: {},
      studentPerformance: {},
    };

    if (sessions.length > 0) {
      // Calculate averages
      const totalScores = sessions.reduce((acc, session) => {
        const total = session.correct_count + session.incorrect_count;
        return acc + (total > 0 ? (session.correct_count / total) * 100 : 0);
      }, 0);

      stats.averageScore = totalScores / sessions.length;

      // Calculate chapter-wise performance
      sessions.forEach((session) => {
        if (!stats.chapterWisePerformance[session.chapter]) {
          stats.chapterWisePerformance[session.chapter] = {
            attempts: 0,
            averageScore: 0,
            totalQuestions: 0,
            studentAttempts: new Set(),
          };
        }

        const chapterStats = stats.chapterWisePerformance[session.chapter];
        chapterStats.attempts++;
        chapterStats.totalQuestions += session.questions.length;
        chapterStats.studentAttempts.add(session.student_id);

        const total = session.correct_count + session.incorrect_count;
        if (total > 0) {
          chapterStats.averageScore =
            (chapterStats.averageScore * (chapterStats.attempts - 1) +
              (session.correct_count / total) * 100) /
            chapterStats.attempts;
        }

        // Track individual student performance
        if (!stats.studentPerformance[session.student_id]) {
          stats.studentPerformance[session.student_id] = {
            name: session.student.name,
            sessions: 0,
            totalCorrect: 0,
            totalIncorrect: 0,
            totalSkipped: 0,
            averageScore: 0,
            completedChapters: new Set(),
          };
        }

        const studentStats = stats.studentPerformance[session.student_id];
        studentStats.sessions++;
        studentStats.totalCorrect += session.correct_count;
        studentStats.totalIncorrect += session.incorrect_count;
        studentStats.totalSkipped += session.skipped_count;
        studentStats.completedChapters.add(session.chapter);

        const studentTotal =
          studentStats.totalCorrect + studentStats.totalIncorrect;
        if (studentTotal > 0) {
          studentStats.averageScore =
            (studentStats.totalCorrect / studentTotal) * 100;
        }
      });

      // Convert Sets to array lengths for JSON serialization
      Object.values(stats.chapterWisePerformance).forEach((chapter) => {
        chapter.uniqueStudents = chapter.studentAttempts.size;
        delete chapter.studentAttempts;
      });

      Object.values(stats.studentPerformance).forEach((student) => {
        student.completedChaptersCount = student.completedChapters.size;
        delete student.completedChapters;
      });
    }

    res.json(stats);
  } catch (error) {
    console.error("Error fetching class statistics:", error);
    res.status(500).json({ error: "Failed to fetch class statistics" });
  }
};

// Load next batch of questions for an existing session
exports.loadNextBatch = async (req, res) => {
  try {
    const { session_id } = req.body;
    const student_id = req.user.user_id;

    // Get current session
    const currentSession = await prisma.mCQSession.findUnique({
      where: { id: parseInt(session_id) },
      include: {
        questions: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!currentSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Get all questions for this combination
    const questions = await prisma.mCQQuestion.findMany({
      where: {
        class_id: currentSession.class_id,
        subject: currentSession.subject,
        chapter: currentSession.chapter,
      },
      orderBy: { id: "asc" },
    });

    // Calculate next batch of questions
    let startIndex = currentSession.last_question_index;
    const remainingQuestions = [];

    // First add questions from last index to end
    remainingQuestions.push(...questions.slice(startIndex));

    // If we need more questions and have completed a full round, start from beginning
    if (remainingQuestions.length < 10 && startIndex > 0) {
      remainingQuestions.push(...questions.slice(0, startIndex));
    }

    // Take up to 10 questions for this batch
    const nextBatchQuestions = remainingQuestions.slice(0, 10);

    // Calculate the new last_question_index
    const nextIndex =
      (startIndex + nextBatchQuestions.length) % questions.length;

    // Add new questions to the existing session
    const createdQuestions = await Promise.all(
      nextBatchQuestions.map((q) =>
        prisma.mCQSessionQuestion.create({
          data: {
            session_id: currentSession.id,
            question_id: q.id,
          },
          include: {
            question: true,
          },
        })
      )
    );

    // Update session's last_question_index
    await prisma.mCQSession.update({
      where: { id: currentSession.id },
      data: {
        last_question_index: nextIndex,
      },
    });

    // Update student progress
    await prisma.studentProgress.update({
      where: {
        student_id_class_id_subject_chapter: {
          student_id,
          class_id: currentSession.class_id,
          subject: currentSession.subject,
          chapter: currentSession.chapter,
        },
      },
      data: {
        last_question_index: nextIndex,
        last_attempted: new Date(),
      },
    });

    // Format questions with full image URLs
    const formattedQuestions = createdQuestions.map((sq) => ({
      ...sq,
      question: {
        ...sq.question,
        options: JSON.parse(sq.question.options),
        image_url: sq.question.image_url ? `${req.protocol}://${req.get('host')}${sq.question.image_url}` : null
      },
    }));

    res.json({
      questions: formattedQuestions,
      totalQuestions: questions.length,
      currentBatchSize: nextBatchQuestions.length,
      remainingQuestions: questions.length - nextIndex,
    });
  } catch (error) {
    console.error("Error loading next batch:", error);
    res.status(500).json({ error: "Failed to load next batch" });
  }
};
