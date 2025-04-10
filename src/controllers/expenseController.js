const { prisma } = require("../config/prisma");
const { createExpenseNotification } = require("../utils/notificationUtils");

// Create expense category
exports.createExpenseCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await prisma.expenseCategory.create({
      data: { name, description },
    });
    res.json(category);
  } catch (error) {
    console.error("Error creating expense category:", error);
    res.status(500).json({ error: "Failed to create expense category" });
  }
};

// Get all expense categories
exports.getExpenseCategories = async (req, res) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      orderBy: { name: "asc" },
    });
    res.json(categories);
  } catch (error) {
    console.error("Error fetching expense categories:", error);
    res.status(500).json({ error: "Failed to fetch expense categories" });
  }
};

// Create new expense
exports.createExpense = async (req, res) => {
  try {
    const {
      category_id,
      amount,
      description,
      expense_date,
      payment_mode,
      transaction_id,
    } = req.body;

    const expense = await prisma.expenditure.create({
      data: {
        category_id: parseInt(category_id),
        amount: parseFloat(amount),
        description,
        expense_date: new Date(expense_date),
        payment_mode,
        transaction_id,
        created_by: req.user.user_id,
        status: req.user.role === "admin" ? "APPROVED" : "PENDING",
        approved_by: req.user.role === "admin" ? req.user.user_id : null,
      },
      include: {
        category: true,
        creator: {
          select: { name: true, role: true, user_id: true },
        },
      },
    });

    // Create appropriate notifications
    if (req.user.role === "admin") {
      // If created by admin, notify creator about auto-approval
      await createExpenseNotification(
        expense.creator.user_id,
        expense.amount,
        "expense_approved"
      );
    } else {
      // Notify creator that expense is pending
      await createExpenseNotification(
        expense.creator.user_id,
        expense.amount,
        "expense_created"
      );
      // Notify admins about pending expense
      await createExpenseNotification(
        null,
        expense.amount,
        "expense_pending",
        expense.creator.user_id
      );
    }

    res.json(expense);
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
};

// Get expenses with filters
exports.getExpenses = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      category_id,
      status,
      payment_mode,
      created_by,
    } = req.query;

    const where = {
      ...(start_date &&
        end_date && {
          expense_date: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        }),
      ...(category_id && { category_id: parseInt(category_id) }),
      ...(status && { status }),
      ...(payment_mode && { payment_mode }),
      ...(created_by && { created_by: parseInt(created_by) }),
    };

    const expenses = await prisma.expenditure.findMany({
      where,
      include: {
        category: true,
        creator: {
          select: { name: true, role: true },
        },
        approver: {
          select: { name: true },
        },
      },
      orderBy: { expense_date: "desc" },
    });

    // Calculate summary statistics
    const summary = {
      total_amount: expenses.reduce((sum, exp) => sum + exp.amount, 0),
      total_count: expenses.length,
      by_category: {},
      by_status: {},
      by_payment_mode: {},
    };

    expenses.forEach((exp) => {
      // Summarize by category
      const catName = exp.category.name;
      if (!summary.by_category[catName]) {
        summary.by_category[catName] = { count: 0, amount: 0 };
      }
      summary.by_category[catName].count++;
      summary.by_category[catName].amount += exp.amount;

      // Summarize by status
      if (!summary.by_status[exp.status]) {
        summary.by_status[exp.status] = { count: 0, amount: 0 };
      }
      summary.by_status[exp.status].count++;
      summary.by_status[exp.status].amount += exp.amount;

      // Summarize by payment mode
      if (!summary.by_payment_mode[exp.payment_mode]) {
        summary.by_payment_mode[exp.payment_mode] = { count: 0, amount: 0 };
      }
      summary.by_payment_mode[exp.payment_mode].count++;
      summary.by_payment_mode[exp.payment_mode].amount += exp.amount;
    });

    res.json({ expenses, summary });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
};

// Update expense status (approve/reject)
exports.updateExpenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const expense = await prisma.expenditure.update({
      where: { id: parseInt(id) },
      data: {
        status,
        remarks,
        approved_by: req.user.user_id,
        updated_at: new Date(),
      },
      include: {
        creator: {
          select: { user_id: true, name: true },
        },
      },
    });

    // Create notification for expense creator based on status
    await createExpenseNotification(
      expense.creator.user_id,
      expense.amount,
      status === "APPROVED" ? "expense_approved" : "expense_rejected",
      null,
      remarks
    );

    res.json(expense);
  } catch (error) {
    console.error("Error updating expense status:", error);
    res.status(500).json({ error: "Failed to update expense status" });
  }
};

// Delete expense (only if pending)
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await prisma.expenditure.findUnique({
      where: { id: parseInt(id) },
    });

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    if (expense.status !== "PENDING") {
      return res.status(403).json({
        error: "Only pending expenses can be deleted",
      });
    }

    if (expense.created_by !== req.user.user_id && req.user.role !== "admin") {
      return res.status(403).json({
        error: "You can only delete your own pending expenses",
      });
    }

    await prisma.expenditure.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
};
