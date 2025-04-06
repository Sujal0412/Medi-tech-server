import nodemailer from "nodemailer";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();
// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 465,
  service: process.env.SMTP_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Encrypt data
export const encryptData = (data) => {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_SECRET_KEY
  ).toString();
};

// Decrypt data
export const decryptData = (ciphertext) => {
  const bytes = CryptoJS.AES.decrypt(
    ciphertext,
    process.env.ENCRYPTION_SECRET_KEY
  );
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};

// Send verification email
export const sendVerificationEmail = async (user, token) => {
  // Encrypt the token for extra security
  const encryptedToken = encryptData({ id: user._id, token });

  // Create verification URL with encrypted token
  const verificationUrl = `${
    process.env.ORIGIN
  }/verify-email/${encodeURIComponent(encryptedToken)}`;

  const mailOptions = {
    from: `"MediTech" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Verify Your Email Address",
    html: `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="color: #2563eb; margin: 0;">MediTech</h2>
      <p style="color: #6b7280; font-size: 16px; margin: 4px 0 0;">Your Partner in Smarter Healthcare</p>
    </div>

    <div style="margin-bottom: 32px;">
      <h3 style="color: #111827; font-weight: 600;">Hello ${user.name},</h3>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 12px;">
        Thank you for signing up with <strong>MediTech</strong>. To get started, please confirm your email address by clicking the button below.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
        Verify Email Address
      </a>
    </div>

    <div style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
      <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">
        If you did not sign up for a MediTech account, please disregard this email.
      </p>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 8px;">
        This verification link will expire in 24 hours.
      </p>
    </div>
  </div>
`,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Email sending failed:", error);
    return false;
  }
};
