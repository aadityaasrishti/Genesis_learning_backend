const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  createExpenseCategory,
  getExpenseCategories,
  createExpense,
  getExpenses,
  updateExpenseStatus,
  deleteExpense,
} = require("../controllers/expenseController");

// Middleware to check admin role
const checkAdminRole = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Category management (admin only)
router.post("/categories", authMiddleware(["admin"]), createExpenseCategory);

router.get(
  "/categories",
  authMiddleware(["admin", "support_staff"]),
  getExpenseCategories
);

// Expense management
router.post("/", authMiddleware(["admin", "support_staff"]), createExpense);

router.get("/", authMiddleware(["admin", "support_staff"]), getExpenses);

// Expense approval (admin only)
router.patch("/:id/status", authMiddleware(["admin"]), updateExpenseStatus);

// Delete expense (admin or owner if pending)
router.delete(
  "/:id",
  authMiddleware(["admin", "support_staff"]),
  deleteExpense
);

module.exports = router;
