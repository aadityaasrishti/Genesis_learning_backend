const { prisma } = require("../config/prisma");
const nodemailer = require("nodemailer");
require('dotenv').config();

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Generate a random OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create or update OTP record
const createOTP = async (identifier, type) => {
    const code = generateOTP();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    console.log(`[${new Date().toISOString()}] Generating ${type} OTP for ${identifier}`);
    console.log(`OTP will expire at: ${expires_at.toISOString()}`);

    // Delete any existing unverified OTPs for this identifier
    await prisma.oTP.deleteMany({
        where: {
            identifier,
            type,
            verified: false
        }
    });

    // Create new OTP
    const otp = await prisma.oTP.create({
        data: {
            identifier,
            type,
            code,
            expires_at
        }
    });

    return code;
};

// Send OTP via email
const sendEmailOTP = async (email, otp) => {
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"School System" <noreply@school.com>',
            to: email,
            subject: "Email Verification OTP",
            text: `Your OTP for email verification is: ${otp}. This code will expire in 10 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Email Verification</h2>
                    <p>Your OTP for email verification is:</p>
                    <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                    <p>This code will expire in 10 minutes.</p>
                    <p style="color: #666;">If you didn't request this code, please ignore this email.</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error("Failed to send email OTP:", error);
        return false;
    }
};

// Verify OTP
const verifyOTP = async (identifier, type, code) => {
    // First check if there's already a verified OTP
    const verifiedOTP = await prisma.oTP.findFirst({
        where: {
            identifier,
            type,
            verified: true,
            created_at: {
                // Check for verified OTPs within the last 15 minutes
                gt: new Date(Date.now() - 15 * 60 * 1000)
            }
        }
    });

    if (verifiedOTP) {
        console.log(`[${new Date().toISOString()}] Found previously verified ${type} OTP for ${identifier}`);
        return true;
    }

    // If no verified OTP found, check for matching unverified OTP
    const otp = await prisma.oTP.findFirst({
        where: {
            identifier,
            type,
            code,
            verified: false,
            expires_at: {
                gt: new Date()
            }
        }
    });

    if (!otp) {
        console.log(`[${new Date().toISOString()}] Failed to verify ${type} OTP for ${identifier}: Invalid or expired`);
        return false;
    }

    // Mark OTP as verified
    await prisma.oTP.update({
        where: { id: otp.id },
        data: { verified: true }
    });

    console.log(`[${new Date().toISOString()}] Successfully verified ${type} OTP for ${identifier}`);
    return true;
};

module.exports = {
    createOTP,
    sendEmailOTP,
    verifyOTP
};