-- CreateTable
CREATE TABLE `User` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NULL,
    `class` VARCHAR(191) NULL,
    `subjects` VARCHAR(191) NULL,
    `requested_class` VARCHAR(191) NULL,
    `requested_subjects` VARCHAR(191) NULL,
    `guardian_name` VARCHAR(191) NULL,
    `plan_status` VARCHAR(191) NULL DEFAULT 'demo',
    `demo_user_flag` BOOLEAN NOT NULL DEFAULT true,
    `profile_image_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_login` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `inactivation_date` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_created_at_idx`(`created_at`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InactiveUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `original_role` VARCHAR(191) NOT NULL,
    `inactivation_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `role_data` JSON NOT NULL,

    UNIQUE INDEX `InactiveUser_user_id_key`(`user_id`),
    INDEX `InactiveUser_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminSupportStaff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `salary` DOUBLE NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `AdminSupportStaff_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Teacher` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `class_assigned` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `salary` DOUBLE NULL,

    UNIQUE INDEX `Teacher_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `user_id` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE') NOT NULL,
    `recorded_by` INTEGER NOT NULL,
    `extra_class_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attendance_user_id_idx`(`user_id`),
    INDEX `Attendance_date_idx`(`date`),
    INDEX `Attendance_extra_class_id_idx`(`extra_class_id`),
    PRIMARY KEY (`user_id`, `date`, `subject`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Student` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `enrollment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mobile` VARCHAR(191) NOT NULL,
    `guardian_name` VARCHAR(191) NOT NULL,
    `guardian_mobile` VARCHAR(191) NOT NULL,
    `subjects` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `date_of_birth` DATETIME(3) NULL,
    `fee_structure_id` INTEGER NULL,
    `fee_due_date` DATETIME(3) NULL,

    UNIQUE INDEX `Student_user_id_key`(`user_id`),
    INDEX `Student_class_id_idx`(`class_id`),
    INDEX `Student_fee_structure_id_idx`(`fee_structure_id`),
    INDEX `Student_fee_due_date_idx`(`fee_due_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Holiday_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExtraClass` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `teacher_id` INTEGER NOT NULL,
    `created_by` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `start_time` VARCHAR(191) NOT NULL,
    `end_time` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExtraClass_class_id_idx`(`class_id`),
    INDEX `ExtraClass_teacher_id_idx`(`teacher_id`),
    INDEX `ExtraClass_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_read` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Notification_user_id_idx`(`user_id`),
    INDEX `Notification_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `image_url` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `StudentRequest_student_id_idx`(`student_id`),
    INDEX `StudentRequest_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeacherTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER NOT NULL,
    `assigned_by` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TeacherTask_teacher_id_idx`(`teacher_id`),
    INDEX `TeacherTask_assigned_by_idx`(`assigned_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `from_id` INTEGER NOT NULL,
    `to_id` INTEGER NOT NULL,
    `message` TEXT NOT NULL,
    `rating` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Feedback_from_id_idx`(`from_id`),
    INDEX `Feedback_to_id_idx`(`to_id`),
    INDEX `Feedback_created_at_idx`(`created_at` DESC),
    INDEX `Feedback_is_deleted_idx`(`is_deleted`),
    INDEX `Feedback_from_id_created_at_is_deleted_idx`(`from_id`, `created_at` DESC, `is_deleted`),
    INDEX `Feedback_to_id_created_at_is_deleted_idx`(`to_id`, `created_at` DESC, `is_deleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `assigned_students` VARCHAR(191) NOT NULL,
    `file_url` VARCHAR(191) NULL,

    INDEX `Assignment_teacher_id_idx`(`teacher_id`),
    INDEX `Assignment_class_id_idx`(`class_id`),
    INDEX `Assignment_due_date_idx`(`due_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssignmentSubmission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignment_id` INTEGER NOT NULL,
    `student_id` INTEGER NOT NULL,
    `file_url` VARCHAR(191) NULL,
    `text_response` TEXT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `grade` DOUBLE NULL,
    `teacher_comment` TEXT NULL,
    `graded_at` DATETIME(3) NULL,

    INDEX `AssignmentSubmission_assignment_id_idx`(`assignment_id`),
    INDEX `AssignmentSubmission_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExamNotification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `exam_date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `syllabus_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExamNotification_student_id_idx`(`student_id`),
    INDEX `ExamNotification_exam_date_idx`(`exam_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeeStructure` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `payment_type` ENUM('ONE_TIME', 'INSTALLMENT', 'MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL,
    `valid_from` DATETIME(3) NOT NULL,
    `valid_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeePayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `fee_structure_id` INTEGER NOT NULL,
    `amount_paid` DOUBLE NOT NULL,
    `payment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payment_mode` ENUM('CASH', 'CHEQUE', 'ONLINE', 'BANK_TRANSFER', 'UPI') NOT NULL,
    `transaction_id` VARCHAR(191) NULL,
    `receipt_number` VARCHAR(191) NOT NULL,
    `payment_status` ENUM('PENDING', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED') NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `late_fee` DOUBLE NULL,
    `discount_amount` DOUBLE NULL,
    `discount_reason` VARCHAR(191) NULL,
    `month` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FeePayment_receipt_number_key`(`receipt_number`),
    INDEX `FeePayment_student_id_idx`(`student_id`),
    INDEX `FeePayment_fee_structure_id_idx`(`fee_structure_id`),
    INDEX `FeePayment_month_idx`(`month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeeReminder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `payment_id` INTEGER NULL,
    `reminder_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reminder_type` ENUM('DUE_DATE', 'OVERDUE', 'FINAL_NOTICE') NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,

    INDEX `FeeReminder_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeacherSalary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER NOT NULL,
    `salary_type` ENUM('FIXED', 'COMMISSION_BASED') NOT NULL,
    `base_amount` DOUBLE NULL,
    `class_specific_rates` VARCHAR(191) NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `TeacherSalary_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalaryPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER NOT NULL,
    `salary_id` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `commission_details` JSON NULL,
    `payment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payment_status` ENUM('PENDING', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED') NOT NULL,
    `payment_mode` ENUM('CASH', 'CHEQUE', 'ONLINE', 'BANK_TRANSFER', 'UPI') NOT NULL,
    `transaction_id` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,

    INDEX `SalaryPayment_teacher_id_idx`(`teacher_id`),
    INDEX `SalaryPayment_salary_id_idx`(`salary_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Test` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `duration` INTEGER NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `created_by` INTEGER NOT NULL,
    `assignedStudents` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Test_created_by_idx`(`created_by`),
    INDEX `Test_class_id_idx`(`class_id`),
    INDEX `Test_startTime_idx`(`startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestSubmission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `test_id` INTEGER NOT NULL,
    `student_id` INTEGER NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `grade` DOUBLE NULL,
    `feedback` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isLate` BOOLEAN NULL,

    INDEX `TestSubmission_test_id_idx`(`test_id`),
    INDEX `TestSubmission_student_id_idx`(`student_id`),
    INDEX `TestSubmission_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `file_url` VARCHAR(191) NOT NULL,
    `file_type` ENUM('PDF', 'DOCX', 'VIDEO') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Notes_teacher_id_idx`(`teacher_id`),
    INDEX `Notes_class_id_idx`(`class_id`),
    INDEX `Notes_subject_idx`(`subject`),
    INDEX `Notes_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotesApproval` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `notes_id` INTEGER NOT NULL,
    `admin_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL,
    `remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotesApproval_notes_id_key`(`notes_id`),
    INDEX `NotesApproval_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MCQQuestion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `chapter` VARCHAR(191) NOT NULL,
    `question_text` TEXT NOT NULL,
    `image_url` VARCHAR(191) NULL,
    `options` JSON NOT NULL,
    `correct_answer` INTEGER NOT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `MCQQuestion_class_id_idx`(`class_id`),
    INDEX `MCQQuestion_subject_idx`(`subject`),
    INDEX `MCQQuestion_chapter_idx`(`chapter`),
    INDEX `MCQQuestion_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MCQSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `chapter` VARCHAR(191) NOT NULL,
    `start_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_time` DATETIME(3) NULL,
    `duration` INTEGER NOT NULL,
    `correct_count` INTEGER NOT NULL DEFAULT 0,
    `incorrect_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `last_question_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `MCQSession_student_id_idx`(`student_id`),
    INDEX `MCQSession_class_id_idx`(`class_id`),
    INDEX `MCQSession_subject_idx`(`subject`),
    INDEX `MCQSession_chapter_idx`(`chapter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MCQSessionQuestion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `question_id` INTEGER NOT NULL,
    `selected_answer` INTEGER NULL,
    `is_correct` BOOLEAN NULL,
    `answered_at` DATETIME(3) NULL,

    INDEX `MCQSessionQuestion_session_id_idx`(`session_id`),
    INDEX `MCQSessionQuestion_question_id_idx`(`question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentProgress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `chapter` VARCHAR(191) NOT NULL,
    `last_question_index` INTEGER NOT NULL DEFAULT 0,
    `last_attempted` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `StudentProgress_student_id_idx`(`student_id`),
    INDEX `StudentProgress_class_id_idx`(`class_id`),
    INDEX `StudentProgress_subject_idx`(`subject`),
    UNIQUE INDEX `StudentProgress_student_id_class_id_subject_chapter_key`(`student_id`, `class_id`, `subject`, `chapter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyChallenge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `teacher_id` INTEGER NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `questions` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DailyChallenge_teacher_id_idx`(`teacher_id`),
    INDEX `DailyChallenge_class_id_idx`(`class_id`),
    INDEX `DailyChallenge_subject_idx`(`subject`),
    INDEX `DailyChallenge_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyChallengeSubmission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `challenge_id` INTEGER NOT NULL,
    `student_id` INTEGER NOT NULL,
    `answers` JSON NOT NULL,
    `score` DOUBLE NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DailyChallengeSubmission_challenge_id_idx`(`challenge_id`),
    INDEX `DailyChallengeSubmission_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ExpenseCategory_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expenditure` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` TEXT NOT NULL,
    `receipt_url` VARCHAR(191) NULL,
    `expense_date` DATETIME(3) NOT NULL,
    `payment_mode` ENUM('CASH', 'CHEQUE', 'ONLINE', 'BANK_TRANSFER', 'UPI') NOT NULL,
    `transaction_id` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `created_by` INTEGER NOT NULL,
    `approved_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `remarks` TEXT NULL,

    INDEX `Expenditure_category_id_idx`(`category_id`),
    INDEX `Expenditure_created_by_idx`(`created_by`),
    INDEX `Expenditure_approved_by_idx`(`approved_by`),
    INDEX `Expenditure_expense_date_idx`(`expense_date`),
    INDEX `Expenditure_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExamResult` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `exam_type` VARCHAR(191) NOT NULL,
    `marks` DOUBLE NOT NULL,
    `total_marks` DOUBLE NOT NULL,
    `percentage` DOUBLE NOT NULL,
    `grade` VARCHAR(191) NULL,
    `exam_date` DATETIME(3) NOT NULL,
    `remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ExamResult_student_id_idx`(`student_id`),
    INDEX `ExamResult_subject_idx`(`subject`),
    INDEX `ExamResult_exam_date_idx`(`exam_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClassSchedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `teacher_id` INTEGER NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `start_time` VARCHAR(191) NOT NULL,
    `end_time` VARCHAR(191) NOT NULL,
    `room` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ClassSchedule_class_id_idx`(`class_id`),
    INDEX `ClassSchedule_teacher_id_idx`(`teacher_id`),
    INDEX `ClassSchedule_day_of_week_idx`(`day_of_week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OTP` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `OTP_identifier_type_idx`(`identifier`, `type`),
    INDEX `OTP_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InactiveUser` ADD CONSTRAINT `InactiveUser_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminSupportStaff` ADD CONSTRAINT `AdminSupportStaff_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_recorded_by_fkey` FOREIGN KEY (`recorded_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_extra_class_id_fkey` FOREIGN KEY (`extra_class_id`) REFERENCES `ExtraClass`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_fee_structure_id_fkey` FOREIGN KEY (`fee_structure_id`) REFERENCES `FeeStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExtraClass` ADD CONSTRAINT `ExtraClass_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExtraClass` ADD CONSTRAINT `ExtraClass_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentRequest` ADD CONSTRAINT `StudentRequest_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeacherTask` ADD CONSTRAINT `TeacherTask_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeacherTask` ADD CONSTRAINT `TeacherTask_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_from_id_fkey` FOREIGN KEY (`from_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_to_id_fkey` FOREIGN KEY (`to_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssignmentSubmission` ADD CONSTRAINT `AssignmentSubmission_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `Assignment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssignmentSubmission` ADD CONSTRAINT `AssignmentSubmission_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamNotification` ADD CONSTRAINT `ExamNotification_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeePayment` ADD CONSTRAINT `FeePayment_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `Student`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeePayment` ADD CONSTRAINT `FeePayment_fee_structure_id_fkey` FOREIGN KEY (`fee_structure_id`) REFERENCES `FeeStructure`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeePayment` ADD CONSTRAINT `FeePayment_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeReminder` ADD CONSTRAINT `FeeReminder_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `Student`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeacherSalary` ADD CONSTRAINT `TeacherSalary_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_salary_id_fkey` FOREIGN KEY (`salary_id`) REFERENCES `TeacherSalary`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Test` ADD CONSTRAINT `Test_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestSubmission` ADD CONSTRAINT `TestSubmission_test_id_fkey` FOREIGN KEY (`test_id`) REFERENCES `Test`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestSubmission` ADD CONSTRAINT `TestSubmission_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notes` ADD CONSTRAINT `Notes_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotesApproval` ADD CONSTRAINT `NotesApproval_notes_id_fkey` FOREIGN KEY (`notes_id`) REFERENCES `Notes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotesApproval` ADD CONSTRAINT `NotesApproval_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MCQQuestion` ADD CONSTRAINT `MCQQuestion_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MCQSession` ADD CONSTRAINT `MCQSession_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MCQSessionQuestion` ADD CONSTRAINT `MCQSessionQuestion_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `MCQSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MCQSessionQuestion` ADD CONSTRAINT `MCQSessionQuestion_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `MCQQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentProgress` ADD CONSTRAINT `StudentProgress_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyChallenge` ADD CONSTRAINT `DailyChallenge_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyChallengeSubmission` ADD CONSTRAINT `DailyChallengeSubmission_challenge_id_fkey` FOREIGN KEY (`challenge_id`) REFERENCES `DailyChallenge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyChallengeSubmission` ADD CONSTRAINT `DailyChallengeSubmission_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expenditure` ADD CONSTRAINT `Expenditure_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expenditure` ADD CONSTRAINT `Expenditure_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expenditure` ADD CONSTRAINT `Expenditure_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamResult` ADD CONSTRAINT `ExamResult_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassSchedule` ADD CONSTRAINT `ClassSchedule_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
