const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const prisma = new PrismaClient();

const authMiddleware = (allowedRoles = ["admin", "teacher", "student", "support_staff"]) => {
  return async (req, res, next) => {
    try {
      // Get token from header or query parameter for PDF endpoints
      const token = req.header("Authorization")?.replace("Bearer ", "") || req.query.token;

      if (!token) {
        return res.status(401).json({ 
          error: "Authentication required. Please login again.",
          code: "NO_TOKEN"
        });
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database with role-specific data
      const user = await prisma.user.findUnique({
        where: { user_id: decoded.user_id },
        include: {
          teacher: true,
          student: true,
          adminSupportStaff: true,
        },
      });

      if (!user) {
        return res.status(401).json({ 
          error: "User not found. Please login again.",
          code: "USER_NOT_FOUND"
        });
      }

      if (!user.is_active) {
        return res.status(403).json({ 
          error: "Account is inactive. Please contact support.",
          code: "ACCOUNT_INACTIVE"
        });
      }

      // Check if user role is allowed
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        return res.status(403).json({ 
          error: "You don't have permission to access this resource.",
          code: "INVALID_ROLE",
          requiredRoles: allowedRoles,
          userRole: user.role
        });
      }

      // Add user and role-specific data to request
      req.user = {
        ...decoded,
        role: user.role,
        user_id: user.user_id,
        // Include role-specific data
        teacher: user.teacher,
        student: user.student,
        adminSupportStaff: user.adminSupportStaff
      };

      next();
    } catch (err) {
      console.error("Auth middleware error:", {
        message: err.message,
        stack: err.stack,
        token: token ? "present" : "missing"
      });

      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ 
          error: "Invalid authentication token. Please login again.",
          code: "INVALID_TOKEN"
        });
      }
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ 
          error: "Authentication token expired. Please login again.",
          code: "TOKEN_EXPIRED"
        });
      }

      res.status(401).json({ 
        error: "Authentication failed. Please login again.",
        code: "AUTH_FAILED"
      });
    }
  };
};

// Role-specific middleware helpers
const adminCheck = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: req.user.user_id },
      select: { role: true },
    });

    if (!user || user.role !== "admin") {
      return res.status(403).json({ 
        error: "Admin access required",
        code: "ADMIN_REQUIRED"
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ 
      error: "Authorization check failed",
      code: "AUTH_CHECK_FAILED"
    });
  }
};

const teacherCheck = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: req.user.user_id },
      select: { role: true },
    });

    if (!user || user.role !== "teacher") {
      return res.status(403).json({ 
        error: "Teacher access required",
        code: "TEACHER_REQUIRED"
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ 
      error: "Authorization check failed",
      code: "AUTH_CHECK_FAILED"
    });
  }
};

const adminstaffCheck = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: req.user.user_id },
      select: { role: true },
    });

    if (!user || (user.role !== "admin" && user.role !== "support_staff")) {
      return res.status(403).json({ 
        error: "Admin or staff access required",
        code: "ADMIN_STAFF_REQUIRED"
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ 
      error: "Authorization check failed",
      code: "AUTH_CHECK_FAILED"
    });
  }
};

module.exports = {
  authMiddleware,
  adminCheck,
  teacherCheck,
  adminstaffCheck
};
