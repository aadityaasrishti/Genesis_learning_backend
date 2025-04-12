const { prisma } = require("../config/prisma");
const path = require("path");
const fs = require("fs").promises;
const {
  createAssignmentNotifications,
  createSubmissionNotification,
} = require("../utils/notificationUtils");

// Ensure Prisma is connected before handling requests
let prismaConnected = false;

const ensurePrismaConnection = async () => {
  if (!prismaConnected) {
    await prisma.$connect();
    prismaConnected = true;
  }
};

const createAssignment = async (req, res) => {
  try {
    await ensurePrismaConnection();
    const { title, description, class_id, subject, due_date } = req.body;
    const student_ids = JSON.parse(req.body.student_ids);
    const teacher_id = req.user.user_id;
    let file_url = null;

    console.log("Creating assignment with teacher_id:", teacher_id);

    // Get teacher's name for notifications
    const teacher = await prisma.user.findUnique({
      where: { user_id: teacher_id },
      select: { name: true, role: true },
    });

    if (!teacher) {
      throw new Error("Teacher not found");
    }

    console.log("Found teacher:", teacher);

    if (req.file) {
      const uploadDir = path.join(__dirname, "../../uploads/assignments");
      await fs.mkdir(uploadDir, { recursive: true });

      const fileName = `${Date.now()}-${req.file.originalname}`;
      await fs.writeFile(path.join(uploadDir, fileName), req.file.buffer);
      file_url = `/uploads/assignments/${fileName}`;
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        class_id,
        subject,
        due_date: new Date(due_date),
        teacher_id,
        assigned_students: student_ids.join(","),
        file_url,
      },
    });

    console.log("Assignment created:", assignment);

    // Create notifications for assigned students, admin, and support staff
    await createAssignmentNotifications(
      student_ids,
      title,
      due_date,
      "assignment",
      teacher.name || "Unknown Teacher"
    );

    res.status(201).json({ success: true, assignment });
  } catch (error) {
    console.error("Assignment creation error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Error creating assignment",
      error: error.message,
    });
  }
};

const getAssignments = async (req, res) => {
  try {
    await ensurePrismaConnection();

    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated or role not defined",
      });
    }

    const { role, user_id } = req.user;
    const { limit, upcoming } = req.query;
    const now = new Date();

    let queryOptions = {
      where: {},
      include: {
        submissions: true,
        teacher: {
          select: {
            name: true,
          },
        },
      },
      orderBy:
        upcoming === "true" ? { due_date: "asc" } : { created_at: "desc" },
    };

    if (limit) {
      queryOptions.take = parseInt(limit);
    }

    if (role === "teacher") {
      queryOptions.where.teacher_id = user_id;
      if (upcoming === "true") {
        queryOptions.where.due_date = {
          gte: now,
        };
      }
    } else if (role === "student") {
      queryOptions.where.assigned_students = {
        contains: user_id.toString(),
      };
      if (upcoming === "true") {
        queryOptions.where.due_date = {
          gte: now,
        };
      }
      queryOptions.include.submissions = {
        where: {
          student_id: user_id,
        },
      };
    }

    const assignments = await prisma.assignment.findMany(queryOptions);

    if (role === "student") {
      const processedAssignments = assignments.map((assignment) => {
        const submission = assignment.submissions[0];
        let status = "pending";
        let isLate = false;
        let isClosed = false;

        const now = new Date();
        const dueDate = new Date(assignment.due_date);
        const latePeriod = new Date(dueDate);
        latePeriod.setDate(latePeriod.getDate() + 5);

        if (submission) {
          status = "submitted";
          isLate = new Date(submission.submitted_at) > dueDate;
        } else if (now > latePeriod) {
          status = "closed";
          isClosed = true;
        } else if (now > dueDate) {
          status = "overdue";
        }

        return {
          ...assignment,
          status,
          isLate,
          isClosed,
          submissionStatus: submission ? (isLate ? "late" : "on time") : null,
        };
      });
      res.json({ success: true, assignments: processedAssignments });
    } else {
      // For teachers, include late submission and closure information
      const processedAssignments = assignments.map((assignment) => {
        const dueDate = new Date(assignment.due_date);
        const latePeriod = new Date(dueDate);
        latePeriod.setDate(latePeriod.getDate() + 5);
        const now = new Date();
        const isClosed = now > latePeriod;

        return {
          ...assignment,
          isClosed,
          submissions: assignment.submissions.map((submission) => ({
            ...submission,
            isLate: new Date(submission.submitted_at) > dueDate,
            submissionStatus:
              new Date(submission.submitted_at) > dueDate ? "late" : "on time",
          })),
        };
      });
      res.json({ success: true, assignments: processedAssignments });
    }
  } catch (error) {
    console.error("Assignment fetch error:", {
      error: error.message,
      stack: error.stack,
      user: req.user,
      query: req.query,
    });
    res.status(500).json({
      success: false,
      message: "Error fetching assignments",
      error: error.message,
    });
  }
};

const submitAssignment = async (req, res) => {
  try {
    await ensurePrismaConnection();
    const { assignment_id } = req.params;
    const { text_response } = req.body;
    const student_id = req.user.user_id;
    let file_url = null;

    // Get assignment to check due date
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(assignment_id) },
      include: {
        teacher: {
          select: {
            user_id: true,
          },
        },
      },
    });

    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    }

    const now = new Date();
    const dueDate = new Date(assignment.due_date);
    const latePeriod = new Date(dueDate);
    latePeriod.setDate(latePeriod.getDate() + 5); // Add 5 days to due date

    // Check if submission is past the late period
    if (now > latePeriod) {
      return res.status(403).json({
        success: false,
        message:
          "Submission period has ended. Assignment can no longer be submitted.",
      });
    }
    const isLate = now > dueDate;

    if (req.file) {
      const uploadDir = path.join(
        process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads"),
        "assignments"
      );
      await fs.mkdir(uploadDir, { recursive: true });

      const fileName = `${Date.now()}-${req.file.originalname}`;
      await fs.writeFile(path.join(uploadDir, fileName), req.file.buffer);
      file_url = `/uploads/assignments/${fileName}`;
    }

    const submission = await prisma.assignmentSubmission.create({
      data: {
        assignment_id: parseInt(assignment_id),
        student_id,
        file_url,
        text_response,
      },
    });

    // Get student name for notification
    const student = await prisma.user.findUnique({
      where: { user_id: student_id },
      select: { name: true },
    });

    // Create notification for teacher and student with late submission info
    if (student) {
      const submissionStatus = isLate ? "late" : "on time";
      await createSubmissionNotification(
        assignment.teacher.user_id,
        student_id,
        student.name,
        assignment.title,
        submissionStatus
      );
    }

    res.status(201).json({
      success: true,
      submission,
      isLate,
      message: isLate
        ? "Assignment submitted successfully (Late Submission)"
        : "Assignment submitted successfully",
    });
  } catch (error) {
    console.error("Assignment submission error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error submitting assignment" });
  }
};

const getSubmissions = async (req, res) => {
  try {
    await ensurePrismaConnection();
    const { assignment_id } = req.params;

    // Get assignment first to access due date
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(assignment_id) },
      select: { due_date: true },
    });

    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    }

    const submissions = await prisma.assignmentSubmission.findMany({
      where: { assignment_id: parseInt(assignment_id) },
      include: {
        student: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Get student details and add late submission info
    const submissionsWithInfo = await Promise.all(
      submissions.map(async (submission) => {
        const student = await prisma.user.findUnique({
          where: { user_id: submission.student_id },
          select: {
            name: true,
            email: true,
          },
        });

        const isLate =
          new Date(submission.submitted_at) > new Date(assignment.due_date);

        return {
          ...submission,
          student: {
            name: student?.name,
            email: student?.email,
          },
          isLate,
          submissionStatus: isLate ? "late" : "on time",
        };
      })
    );

    res.json({ success: true, submissions: submissionsWithInfo });
  } catch (error) {
    console.error("Submissions fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching submissions" });
  }
};

const gradeSubmission = async (req, res) => {
  try {
    await ensurePrismaConnection();
    const { submission_id } = req.params;
    const { grade, teacher_comment } = req.body;
    const teacher_id = req.user.user_id;

    console.log("Grading submission:", {
      submission_id,
      grade,
      teacher_comment,
      teacher_id,
    });

    // Validate grade
    if (grade < 0 || grade > 100) {
      return res.status(400).json({
        success: false,
        message: "Grade must be between 0 and 100",
      });
    }

    // Find submission and check if teacher has access
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: parseInt(submission_id) },
      include: {
        assignment: {
          select: {
            teacher_id: true,
            title: true,
          },
        },
        student: {
          select: {
            name: true,
            user_id: true,
          },
        },
      },
    });

    if (!submission) {
      console.error("Submission not found:", { submission_id });
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    // Check if the teacher owns this assignment
    if (submission.assignment.teacher_id !== teacher_id) {
      console.error(
        "Teacher does not have permission to grade this submission:",
        { teacher_id, assignment_teacher_id: submission.assignment.teacher_id }
      );
      return res.status(403).json({
        success: false,
        message: "You don't have permission to grade this submission",
      });
    }

    // Update submission with grade
    const updatedSubmission = await prisma.assignmentSubmission.update({
      where: { id: parseInt(submission_id) },
      data: {
        grade: parseFloat(grade),
        teacher_comment,
        graded_at: new Date(),
      },
    });

    console.log("Submission graded successfully:", {
      submission_id,
      grade,
      teacher_comment,
    });

    // Notify student about the grade
    await prisma.notification.create({
      data: {
        user_id: submission.student.user_id,
        message: `Your submission for "${submission.assignment.title}" has been graded. Grade: ${grade}`,
        type: "assignment_graded",
      },
    });

    res.json({
      success: true,
      submission: updatedSubmission,
      message: "Submission graded successfully",
    });
  } catch (error) {
    console.error("Grading error:", error);
    res.status(500).json({
      success: false,
      message: "Error grading submission",
    });
  }
};

const updateAssignment = async (req, res) => {
  try {
    await ensurePrismaConnection();
    const { id } = req.params;
    const { title, description, class_id, subject, due_date } = req.body;
    const student_ids = JSON.parse(req.body.student_ids);
    let file_url = null;

    // Find existing assignment to verify teacher ownership
    const existingAssignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingAssignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    }

    if (existingAssignment.teacher_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to edit this assignment",
      });
    } // Handle file upload if provided
    if (req.file) {
      const uploadDir = path.join(
        process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads"),
        "assignments"
      );
      await fs.mkdir(uploadDir, { recursive: true });

      const fileName = `${Date.now()}-${req.file.originalname}`;
      await fs.writeFile(path.join(uploadDir, fileName), req.file.buffer);
      file_url = `/uploads/assignments/${fileName}`;

      // Delete old file if exists
      if (existingAssignment.file_url) {
        try {
          const oldFilePath = path.join(
            process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../.."),
            existingAssignment.file_url
          );
          await fs.unlink(oldFilePath);
        } catch (error) {
          console.error("Error deleting old file:", error);
        }
      }
    }

    const updatedAssignment = await prisma.assignment.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        class_id,
        subject,
        due_date: new Date(due_date),
        assigned_students: student_ids.join(","),
        ...(file_url && { file_url }),
      },
    });

    // Notify students about the updated assignment
    await createAssignmentNotifications(
      student_ids,
      `Assignment "${title}" has been updated`,
      due_date,
      "assignment_update"
    );

    res.json({ success: true, assignment: updatedAssignment });
  } catch (error) {
    console.error("Assignment update error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating assignment",
      error: error.message,
    });
  }
};

const deleteAssignment = async (req, res) => {
  try {
    await ensurePrismaConnection();
    const { id } = req.params; // Find assignment to verify teacher ownership and get file path
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        submissions: true,
      },
    });

    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    }

    if (assignment.teacher_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this assignment",
      });
    }

    // Delete assignment file if exists
    if (assignment.file_url) {
      try {
        const filePath = path.join(
          process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads"),
          "assignments",
          assignment.file_url.split("/").pop() || ""
        );
        if (
          await fs
            .access(filePath)
            .then(() => true)
            .catch(() => false)
        ) {
          await fs.unlink(filePath);
        }
      } catch (error) {
        console.error("Error deleting assignment file:", error);
      }
    }

    // Delete all submission files
    for (const submission of assignment.submissions) {
      if (submission.file_url) {
        try {
          const fileName = submission.file_url.split("/").pop();
          if (fileName) {
            const submissionPath = path.join(
              process.env.UPLOAD_BASE_PATH ||
                path.join(__dirname, "../../uploads"),
              "assignments",
              fileName
            );
            if (
              await fs
                .access(submissionPath)
                .then(() => true)
                .catch(() => false)
            ) {
              await fs.unlink(submissionPath);
            }
          }
        } catch (error) {
          console.error("Error deleting submission file:", error);
        }
      }
    }

    // Delete all submissions first to maintain referential integrity
    await prisma.assignmentSubmission.deleteMany({
      where: { assignment_id: parseInt(id) },
    });

    // Delete the assignment
    await prisma.assignment.delete({
      where: { id: parseInt(id) },
    });

    res.json({ success: true, message: "Assignment deleted successfully" });
  } catch (error) {
    console.error("Assignment deletion error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting assignment",
      error: error.message,
    });
  }
};

module.exports = {
  createAssignment,
  getAssignments,
  submitAssignment,
  getSubmissions,
  gradeSubmission,
  updateAssignment,
  deleteAssignment,
};
