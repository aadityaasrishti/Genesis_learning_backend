const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const StorageService = require("../utils/storageService");

// Initialize storage service for student requests
const requestStorage = new StorageService("student-requests");
requestStorage.createBucketIfNotExists().catch(console.error);

// Log middleware for debugging
const logRequest = (prefix) => (req, res, next) => {
  console.log(`${prefix} Request:`, {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    body: req.body,
    user: req.user,
  });
  next();
};

// Student Request Controllers
exports.createStudentRequest = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);

    const { title, description, type } = req.body;
    const student_id = req.user.user_id;

    if (!title || !description || !type) {
      return res.status(400).json({
        error: "Missing required fields",
        received: { title, description, type },
      });
    }

    let image_url = null;
    if (req.file) {
      // Upload to Supabase storage
      const fileName = `request-${student_id}-${Date.now()}-${req.file.originalname.replace(
        /\s+/g,
        "-"
      )}`;
      image_url = await requestStorage.uploadFile(req.file, fileName);
    }

    const request = await prisma.studentRequest.create({
      data: {
        student_id,
        title,
        description,
        type,
        image_url,
        status: "PENDING",
      },
      include: {
        student: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Notify admin and support staff
    await prisma.notification.createMany({
      data: [
        {
          user_id: student_id,
          message: `Your request "${title}" has been submitted successfully`,
          type: "student_request",
        },
        ...(
          await prisma.user.findMany({
            where: {
              role: {
                in: ["admin", "support_staff"],
              },
            },
          })
        ).map((user) => ({
          user_id: user.user_id,
          message: `New student request: ${title}`,
          type: "student_request",
        })),
      ],
    });

    res.status(201).json(request);
  } catch (error) {
    console.error("Error creating student request:", error);
    res.status(500).json({
      error: "Failed to create student request",
      details: error.message,
    });
  }
};

exports.getStudentRequests = async (req, res) => {
  try {
    const requests = await prisma.studentRequest.findMany({
      where: {
        student_id: req.user.user_id,
      },
      include: {
        student: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
};

exports.getAllStudentRequests = async (req, res) => {
  try {
    const requests = await prisma.studentRequest.findMany({
      include: {
        student: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
};

exports.updateRequestStatus = async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    const validStatuses = ["PENDING", "APPROVED", "REJECTED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // First check if request exists
    const existingRequest = await prisma.studentRequest.findUnique({
      where: { id: requestId },
    });

    if (!existingRequest) {
      return res
        .status(404)
        .json({ error: `Request with ID ${requestId} not found` });
    }

    // Update status in a transaction
    const updatedRequest = await prisma.$transaction(async (tx) => {
      // Update request
      const updated = await tx.studentRequest.update({
        where: { id: requestId },
        data: { status },
      });

      // Create notification
      await tx.notification.create({
        data: {
          user_id: updated.student_id,
          message: `Your request "${
            updated.title
          }" has been ${status.toLowerCase()}`,
          type: "student_request_update",
        },
      });

      return updated;
    });

    res.json(updatedRequest);
  } catch (error) {
    res.status(500).json({
      error: "Failed to update request status",
    });
  }
};

exports.deleteStudentRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.studentRequest.findUnique({
      where: { id: Number(id) },
    });

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Check if user has permission to delete
    if (
      req.user.role === "student" &&
      request.student_id !== req.user.user_id &&
      !["admin", "support_staff"].includes(req.user.role)
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this request" });
    } // Delete associated image from Supabase if it exists
    if (request.image_url && request.image_url.includes("student-requests")) {
      try {
        const fileName = request.image_url.split("/").pop();
        await requestStorage.deleteFile(fileName);
      } catch (error) {
        console.error("Error deleting file from storage:", error);
        // Continue with request deletion even if image deletion fails
      }
    }

    await prisma.studentRequest.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Request deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete request" });
  }
};

// Teacher Task Controllers
exports.createTask = async (req, res) => {
  try {
    const { teacher_id, title, description, due_date, priority } = req.body;
    const assigned_by = req.user.user_id;

    const task = await prisma.teacherTask.create({
      data: {
        teacher_id,
        assigned_by,
        title,
        description,
        due_date: new Date(due_date),
        priority,
      },
    });

    // Create notification for teacher
    await prisma.notification.create({
      data: {
        user_id: teacher_id,
        message: `New task assigned: ${title}`,
        type: "teacher_task",
      },
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: "Failed to create task" });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log("Updating task:", { id, status });

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // First check if the task exists and is not already completed
    const existingTask = await prisma.teacherTask.findUnique({
      where: { id: parseInt(id) },
      include: {
        teacher: true,
      },
    });

    console.log("Existing task:", existingTask);

    if (!existingTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (existingTask.status === "COMPLETED") {
      return res.status(400).json({ error: "Cannot update a completed task" });
    }

    // Validate status value
    const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Get the teacher's name
    const teacher = await prisma.user.findUnique({
      where: { user_id: existingTask.teacher_id },
    });

    const task = await prisma.teacherTask.update({
      where: { id: parseInt(id) },
      data: { status },
      include: {
        teacher: true,
      },
    });

    console.log("Updated task:", task);

    // Send notifications to admins and support staff
    const adminStaff = await prisma.user.findMany({
      where: {
        OR: [{ role: "admin" }, { role: "support_staff" }],
        is_active: true,
      },
    });

    // Create notifications for admins and support staff
    if (adminStaff.length > 0) {
      await prisma.notification.createMany({
        data: adminStaff.map((staff) => ({
          user_id: staff.user_id,
          message: `Task "${task.title}" status updated to ${status} by ${
            teacher?.name || "Unknown Teacher"
          }`,
          type: "task_update",
        })),
      });
    }

    res.json(task);
  } catch (error) {
    console.error("Error updating task status:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Failed to update task status",
      details: error.message,
    });
  }
};

exports.getTeacherTasks = async (req, res) => {
  try {
    const tasks = await prisma.teacherTask.findMany({
      where: {
        teacher_id: req.user.user_id,
      },
      orderBy: {
        due_date: "asc",
      },
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

exports.getAllTasks = async (req, res) => {
  try {
    const tasks = await prisma.teacherTask.findMany({
      orderBy: {
        created_at: "desc",
      },
      include: {
        teacher: {
          select: {
            name: true,
          },
        },
      },
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch all tasks" });
  }
};
