const { prisma } = require("../config/prisma");
const path = require("path");
const fs = require("fs");
const { deleteFile, deleteTestFiles } = require("../utils/fileCleanup");

// Define upload paths
const rootDir = path.resolve(__dirname, "../..");
const UPLOADS_DIR = path.join(rootDir, "uploads");
const TESTS_DIR = path.join(UPLOADS_DIR, "tests");
const SUBMISSIONS_DIR = path.join(UPLOADS_DIR, "submissions");

// Ensure directories exist
[UPLOADS_DIR, TESTS_DIR, SUBMISSIONS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const testController = {
  // Create a new test
  createTest: async (req, res) => {
    try {
      console.log("Create test request details:", {
        body: req.body,
        files: req.files,
        headers: req.headers,
        user: req.user,
      });

      const {
        title,
        description,
        duration,
        type,
        subject,
        assignedStudents,
        startTime,
      } = req.body;

      // Validate required fields
      const missingFields = [];
      if (!title?.trim()) missingFields.push("title");
      if (!description?.trim()) missingFields.push("description");
      if (!duration) missingFields.push("duration");
      if (!type) missingFields.push("type");
      if (!subject) missingFields.push("subject");
      if (!req.body.class) missingFields.push("class");
      if (!startTime) missingFields.push("startTime");

      console.log("Validation check results:", {
        missingFields,
        receivedFields: {
          title,
          description,
          duration,
          type,
          subject,
          class: req.body.class,
          startTime,
        },
      });

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: "Missing required fields",
          missingFields,
          receivedFields: req.body,
        });
      }

      // Validate startTime is a valid date in the future
      const startTimeDate = new Date(startTime);
      const now = new Date();
      if (isNaN(startTimeDate.getTime()) || startTimeDate < now) {
        return res.status(400).json({
          error: "Start time must be a valid date in the future",
          received: startTime,
        });
      }

      if (!["TEXT", "PDF"].includes(type)) {
        return res.status(400).json({
          error: "Invalid test type",
          validTypes: ["TEXT", "PDF"],
          received: type,
        });
      }

      let content = req.body.content;

      if (type === "PDF") {
        if (!req.body.pdf) {
          return res.status(400).json({
            error: "PDF file is required for PDF type tests",
            receivedBody: req.body,
          });
        }

        content = `tests/${req.body.pdf.filename}`;
      } else if (!content?.trim()) {
        return res.status(400).json({
          error: "Test content is required for TEXT type tests",
          type: type,
          receivedBody: req.body,
        });
      }

      console.log("Creating test with data:", {
        title,
        description,
        duration,
        type,
        content,
        subject,
        startTime,
        created_by: req.user.user_id,
        class_id: req.body.class,
        assignedStudents,
      });

      const test = await prisma.test.create({
        data: {
          title: title.trim(),
          description: description.trim(),
          duration: parseInt(duration),
          type,
          content,
          subject: subject.trim(),
          startTime: new Date(startTime),
          created_by: req.user.user_id,
          class_id: req.body.class,
          assignedStudents: assignedStudents || null,
        },
      });

      console.log("Test created successfully:", test);
      res.status(201).json(test);
    } catch (error) {
      console.error("Error creating test:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        error: "Failed to create test",
        details: error.message,
      });
    }
  },

  // Get available tests for a student
  getStudentTests: async (req, res) => {
    try {
      console.log("Getting tests for student:", req.user.user_id);

      const student = await prisma.student.findUnique({
        where: { user_id: req.user.user_id },
        include: {
          user: true,
        },
      });

      if (!student) {
        console.log("Student not found:", req.user.user_id);
        return res.status(404).json({ error: "Student not found" });
      }

      console.log("Student data:", {
        classId: student.class_id,
        userClass: student.user.class,
        subjects: student.subjects,
        userSubjects: student.user.subjects,
      });

      // Get all classes and subjects for the student
      const studentClasses = (student.class_id || student.user.class || "")
        .split(",")
        .map((c) => c.trim());
      const studentSubjects = (student.subjects || student.user.subjects || "")
        .split(",")
        .map((s) => s.trim());

      console.log("Filtered values:", {
        classes: studentClasses,
        subjects: studentSubjects,
      });

      const now = new Date();

      // Get all tests for the student's classes and subjects
      const tests = await prisma.test.findMany({
        where: {
          AND: [
            {
              class_id: {
                in: studentClasses,
              },
            },
            {
              subject: {
                in: studentSubjects,
              },
            },
            {
              OR: [
                { assignedStudents: null },
                {
                  assignedStudents: {
                    contains: req.user.user_id.toString(),
                  },
                },
              ],
            },
          ],
        },
        include: {
          submissions: {
            where: {
              student_id: req.user.user_id,
            },
            select: {
              id: true,
              createdAt: true,
              grade: true,
              feedback: true,
              isLate: true,
            },
          },
        },
        orderBy: {
          startTime: "asc",
        },
      });

      // Format and categorize tests
      const formattedTests = tests.map((test) => {
        const hasSubmitted = test.submissions.length > 0;
        const submission = hasSubmitted ? test.submissions[0] : null;
        const testStartTime = new Date(test.startTime);
        const testEndTime = new Date(
          testStartTime.getTime() + test.duration * 60 * 1000
        );
        const testLateEndTime = new Date(
          testStartTime.getTime() + (test.duration + 10) * 60 * 1000
        );

        let status;
        if (now < testStartTime) {
          status = "upcoming";
        } else if (now >= testStartTime && now <= testLateEndTime) {
          status = "ongoing";
        } else {
          status = "expired";
        }

        const timeLeft = Math.max(0, testEndTime.getTime() - now.getTime());
        const lateTimeLeft = Math.max(
          0,
          testLateEndTime.getTime() - now.getTime()
        );
        const isInGracePeriod = now > testEndTime && now <= testLateEndTime;

        return {
          ...test,
          hasSubmitted,
          submission,
          status,
          endTime: testEndTime,
          lateEndTime: testLateEndTime,
          timeLeft: isInGracePeriod ? 0 : timeLeft,
          lateTimeLeft: isInGracePeriod ? lateTimeLeft : 0,
          isInGracePeriod,
        };
      });

      // Group tests by status
      const groupedTests = {
        upcoming: formattedTests.filter((test) => test.status === "upcoming"),
        ongoing: formattedTests.filter((test) => test.status === "ongoing"),
        expired: formattedTests.filter(
          (test) => test.status === "expired" && !test.hasSubmitted
        ),
        submitted: formattedTests.filter((test) => test.hasSubmitted),
      };

      console.log(
        `Found tests - Upcoming: ${groupedTests.upcoming.length}, Ongoing: ${groupedTests.ongoing.length}, Expired: ${groupedTests.expired.length}, Submitted: ${groupedTests.submitted.length}`
      );
      res.json(groupedTests);
    } catch (error) {
      console.error("Error fetching tests:", error);
      res.status(500).json({ error: "Failed to fetch tests" });
    }
  },

  // Get tests for a teacher
  getTeacherTests: async (req, res) => {
    try {
      const tests = await prisma.test.findMany({
        where: {
          created_by: req.user.user_id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          submissions: {
            include: {
              student: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });
      res.json(tests);
    } catch (error) {
      console.error("Error fetching tests:", error);
      res.status(500).json({ error: "Failed to fetch tests" });
    }
  },

  // Rest of the controller methods...
  getTestSubmissions: async (req, res) => {
    try {
      const { testId } = req.params;
      console.log("Fetching submissions for test:", testId, "User:", req.user);

      // Verify test exists and belongs to the teacher
      const test = await prisma.test.findFirst({
        where: {
          id: parseInt(testId),
          OR: [
            { created_by: req.user.user_id },
            // Allow access to all teachers of the same subject and class
            {
              AND: [
                { subject: { in: req.user.teacher?.subject?.split(",").map(s => s.trim()) } },
                { class_id: { in: req.user.teacher?.class_assigned?.split(",").map(c => c.trim()) } }
              ]
            }
          ]
        },
        include: {
          submissions: {
            include: {
              student: {
                select: {
                  name: true,
                  email: true,
                }
              },
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!test) {
        console.log("Test not found or unauthorized:", { testId, userId: req.user.user_id });
        return res.status(404).json({ 
          error: "Test not found or you don't have permission to view submissions",
          code: "TEST_NOT_FOUND"
        });
      }

      // Format submissions with additional details
      const formattedSubmissions = test.submissions.map(sub => ({
        id: sub.id,
        student_id: sub.student_id,
        student_name: sub.student?.name || "Unknown Student",
        student_email: sub.student?.email || "",
        submitted_at: sub.createdAt.toISOString(),
        grade: sub.grade,
        feedback: sub.feedback,
        is_late: sub.isLate || false,
        status: sub.grade !== null ? 'graded' : 'pending'
      }));

      console.log("Successfully fetched submissions:", {
        testId,
        submissionCount: formattedSubmissions.length
      });

      res.json(formattedSubmissions);
    } catch (error) {
      console.error("Error fetching submissions:", {
        error: error.message,
        stack: error.stack,
        testId: req.params.testId
      });
      res.status(500).json({ 
        error: "Failed to fetch submissions. Please try again.",
        code: "FETCH_ERROR"
      });
    }
  },

  // Submit a test
  submitTest: async (req, res) => {
    try {
      console.log("Submit test request body:", req.body);

      const testId = parseInt(req.body.testId);
      const fileData = req.body.file; // File data from uploadFile middleware

      if (!testId || isNaN(testId)) {
        return res.status(400).json({ error: "Valid test ID is required" });
      }

      if (!fileData) {
        return res.status(400).json({
          error: "No submission file provided",
          receivedData: { body: req.body },
        });
      }

      // Verify test exists
      const test = await prisma.test.findUnique({
        where: { id: testId },
      });

      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }

      // Check if student has already submitted
      const existingSubmission = await prisma.testSubmission.findFirst({
        where: {
          test_id: testId,
          student_id: req.user.user_id,
        },
      });

      if (existingSubmission) {
        return res.status(400).json({
          error: "You have already submitted this test",
        });
      }

      // Calculate if submission is late based on test start time and duration
      const now = new Date();
      const testEndTime = new Date(
        test.startTime.getTime() + (test.duration + 10) * 60 * 1000
      ); // Add 10 minutes grace period
      const isLate = now > testEndTime;

      // Create submission record using the file data from uploadFile middleware
      const submission = await prisma.testSubmission.create({
        data: {
          test_id: testId,
          student_id: req.user.user_id,
          content: fileData.filename, // Use the filename from uploadFile middleware
          isLate: isLate,
        },
      });

      res.status(201).json({
        ...submission,
        isLate,
        message: isLate
          ? "Test submitted after the allowed duration - marked as late submission"
          : "Test submitted successfully",
      });
    } catch (error) {
      console.error("Error submitting test:", error);
      res.status(500).json({ error: "Failed to submit test" });
    }
  },

  // The rest remains unchanged...
  gradeSubmission: async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { grade, feedback } = req.body;

      if (grade === undefined || grade === "") {
        return res.status(400).json({ error: "Grade is required" });
      }

      const gradeValue = parseFloat(grade);
      if (isNaN(gradeValue) || gradeValue < 0 || gradeValue > 100) {
        return res
          .status(400)
          .json({ error: "Grade must be a number between 0 and 100" });
      }

      // Verify submission exists and belongs to a test created by this teacher
      const submission = await prisma.testSubmission.findUnique({
        where: { id: parseInt(submissionId) },
        include: {
          test: true,
        },
      });

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.test.created_by !== req.user.user_id) {
        return res
          .status(403)
          .json({ error: "Unauthorized to grade this submission" });
      }

      const updatedSubmission = await prisma.testSubmission.update({
        where: {
          id: parseInt(submissionId),
        },
        data: {
          grade: gradeValue,
          feedback: feedback?.trim(),
        },
      });

      res.json(updatedSubmission);
    } catch (error) {
      console.error("Error grading submission:", error);
      res.status(500).json({ error: "Failed to grade submission" });
    }
  },

  deleteTest: async (req, res) => {
    try {
      const { testId } = req.params;

      // Verify test exists and belongs to the teacher
      const test = await prisma.test.findFirst({
        where: {
          id: parseInt(testId),
          created_by: req.user.user_id,
        },
      });

      if (!test) {
        return res
          .status(404)
          .json({ error: "Test not found or unauthorized" });
      }

      // Delete test files and associated submission files
      await deleteTestFiles(test);

      // Delete test and all associated submissions from database
      await prisma.$transaction([
        prisma.testSubmission.deleteMany({
          where: { test_id: parseInt(testId) },
        }),
        prisma.test.delete({
          where: { id: parseInt(testId) },
        }),
      ]);

      res.json({ message: "Test deleted successfully" });
    } catch (error) {
      console.error("Error deleting test:", error);
      res.status(500).json({ error: "Failed to delete test" });
    }
  },

  deleteSubmission: async (req, res) => {
    try {
      const { submissionId } = req.params;

      // Verify submission exists and belongs to a test created by this teacher
      const submission = await prisma.testSubmission.findUnique({
        where: { id: parseInt(submissionId) },
        include: { test: true },
      });

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.test.created_by !== req.user.user_id) {
        return res
          .status(403)
          .json({ error: "Unauthorized to delete this submission" });
      }

      // Delete submission file
      await deleteFile(submission.content);

      // Delete submission from database
      await prisma.testSubmission.delete({
        where: { id: parseInt(submissionId) },
      });

      res.json({ message: "Submission deleted successfully" });
    } catch (error) {
      console.error("Error deleting submission:", error);
      res.status(500).json({ error: "Failed to delete submission" });
    }
  },

  // Get students available for test assignment
  getAvailableStudents: async (req, res) => {
    try {
      const { class: classId, subject } = req.query;

      if (!classId || !subject) {
        return res
          .status(400)
          .json({ error: "Class and subject are required" });
      }

      // Get all students in the specified class who take the specified subject
      const students = await prisma.user.findMany({
        where: {
          role: "student",
          AND: [
            {
              OR: [
                {
                  student: {
                    class_id: {
                      contains: classId,
                    },
                  },
                },
                {
                  class: {
                    contains: classId,
                  },
                },
              ],
            },
            {
              OR: [
                {
                  student: {
                    subjects: {
                      contains: subject,
                    },
                  },
                },
                {
                  subjects: {
                    contains: subject,
                  },
                },
              ],
            },
          ],
        },
        select: {
          user_id: true,
          name: true,
          email: true,
          student: {
            select: {
              class_id: true,
              subjects: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      const eligibleStudents = students.filter((student) => {
        // Check if the student's classes include the target class
        const studentClasses = (
          student.student?.class_id ||
          student.class ||
          ""
        )
          .split(",")
          .map((c) => c.trim());

        // Check if the student's subjects include the target subject
        const studentSubjects = (
          student.student?.subjects ||
          student.subjects ||
          ""
        )
          .split(",")
          .map((s) => s.trim());

        return (
          studentClasses.includes(classId.trim()) &&
          studentSubjects.includes(subject.trim())
        );
      });

      res.json(eligibleStudents);
    } catch (error) {
      console.error("Error fetching available students:", error);
      res.status(500).json({ error: "Failed to fetch available students" });
    }
  },

  resetCompromisedTest: async (req, res) => {
    try {
      const { testId, studentId } = req.params;

      // Verify test exists and belongs to the teacher
      const test = await prisma.test.findFirst({
        where: {
          id: parseInt(testId),
          created_by: req.user.user_id,
        },
      });

      if (!test) {
        return res
          .status(404)
          .json({ error: "Test not found or unauthorized" });
      }

      // Verify student exists and is eligible for this test
      const student = await prisma.user.findFirst({
        where: {
          user_id: parseInt(studentId),
          role: "student",
        },
      });

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Since compromised state is stored client-side, we just return success
      // The student will need to clear their localStorage or use the client-side reset
      res.json({
        message: "Test reset successful",
        details: "Student can now retake the test",
      });
    } catch (error) {
      console.error("Error resetting compromised test:", error);
      res.status(500).json({ error: "Failed to reset test" });
    }
  },

  // Get test content
  getTestContent: async (req, res) => {
    try {
      const { testId } = req.params;

      // Verify test exists and user has access
      const test = await prisma.test.findFirst({
        where: {
          id: parseInt(testId),
          OR: [
            { created_by: req.user.user_id }, // Teacher access
            {
              AND: [
                {
                  // Student access
                  OR: [
                    { assignedStudents: null },
                    {
                      assignedStudents: {
                        contains: req.user.user_id.toString(),
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      if (!test) {
        return res
          .status(404)
          .json({ error: "Test not found or unauthorized" });
      }

      if (test.type === "PDF") {
        const filePath = path.join(
          TESTS_DIR,
          test.content.replace("tests/", "")
        );
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: "Test file not found" });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.sendFile(filePath);
      } else {
        res.json({ content: test.content });
      }
    } catch (error) {
      console.error("Error fetching test content:", error);
      res.status(500).json({ error: "Failed to fetch test content" });
    }
  },

  // Get submission content
  getSubmissionContent: async (req, res) => {
    try {
      const { submissionId } = req.params;

      // Verify submission exists and user has access
      const submission = await prisma.testSubmission.findFirst({
        where: {
          id: parseInt(submissionId),
          OR: [
            { student_id: req.user.user_id }, // Student can view their own submission
            {
              test: {
                created_by: req.user.user_id, // Teacher can view submissions for their tests
              },
            },
          ],
        },
        include: {
          test: true,
        },
      });

      if (!submission) {
        return res
          .status(404)
          .json({ error: "Submission not found or unauthorized" });
      }

      const filePath = path.join(SUBMISSIONS_DIR, submission.content);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Submission file not found" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error fetching submission content:", error);
      res.status(500).json({ error: "Failed to fetch submission content" });
    }
  },
};

module.exports = testController;
