import User from "../models/user.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import { genrateToken } from "../utils/genrateToken.js";
import Patient from "../models/patient.js";
import Doctor from "../models/doctor.js";
import crypto from "crypto";
import {
  sendVerificationEmail,
  decryptData,
} from "../services/emailService.js";
import { createSession, endSession } from "../services/sessionService.js";
export const register = AsyncHandler(async (req, res) => {
  const { name, role, email, password } = req.body;

  const exists = await User.findOne({ email });

  if (exists) throw new ErrorHandler("User already exists", 400);

  const user = await User.create({ name, role, email, password });

  if (!user) throw new ErrorHandler("User not created", 400);

  try {
    if (role === "patient") {
      const patient = await Patient.create({
        user: user._id,
        patientIdentifier: `PAT-${Date.now()}`,
        consultationHistory: [],
      });
      if (!patient) throw new Error("Patient creation failed");
      user.patient = patient._id;
      await user.save();
    } else if (role === "doctor") {
      const doctor = await Doctor.create({ user: user._id });
      if (!doctor) throw new Error("Doctor creation failed");
      user.doctor = doctor._id;
      await user.save();
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.verificationToken = token;
    user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user, token);
  } catch (error) {
    await Patient.findByIdAndDelete(user.patient);
    await Doctor.findByIdAndDelete(user.doctor);
    await User.findByIdAndDelete(user._id);
    throw new ErrorHandler("User registration failed", 400);
  }

  const newuser = await User.findById(user._id).select("-password");

  res.status(201).json({
    success: true,
    user: newuser,
  });
});

export const login = AsyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    throw new ErrorHandler("User not exists", 400);
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ErrorHandler("Invalid email or password", 400);
  }

  // Check if email is verified
  if (!user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: "Please verify your email before logging in",
      isVerified: false,
      userId: user._id,
    });
  }

  // if (user?.sessionToken) {
  //   return res.status(403).json({
  //     success: false,
  //     message: "User already logged in",
  //     isVerified: true,
  //     userId: user._id,
  //   });
  // }

  // Generate JWT token
  const token = genrateToken(user._id);

  const session = await createSession(user, req);

  res.status(200).json({
    success: true,
    user: await User.findById(user._id).select("-password"),
    token,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  });
});

export const getuser = AsyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -loginHistory -lastLoginIP -lastLoginAt -sessionExpiresAt -lastLogoutAt -verificationToken -verificationTokenExpiry -sessionToken"
  );

  if (!user) throw new ErrorHandler("user not found", 404);

  res.status(200).json({ user });
});

export const changePassword = AsyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) throw new ErrorHandler("User not found", 404);

  const match = await user.comparePassword(oldPassword);

  if (!match) throw new ErrorHandler("Invalid password", 400);

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: "Password updated" });
});

export const createAccountPatient = AsyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    contactNumber,
    dateOfBirth,
    gender,
    address,
    emergencyContact,
  } = req.body;

  // Check if required fields are provided
  if (!firstName || !lastName || !contactNumber || !dateOfBirth || !gender) {
    throw new ErrorHandler("Required fields are missing", 400);
  }

  // Check if email is provided and not already in use
  if (email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ErrorHandler("Email already registered", 400);
    }
  }

  // Create user
  const user = await User.create({
    email: email,
    password: password,
    role: "patient",
    name: `${firstName} ${lastName}`,
  });

  if (!user) {
    throw new ErrorHandler("User creation failed", 400);
  }

  // Create patient
  await Patient.create({
    user: user._id,
    patientIdentifier: `PAT-${Date.now()}`,
    consultationHistory: [],
  });

  const patient = await Patient.findOneAndUpdate(
    { user: user._id },
    {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      contactNumber,
      address,
      emergencyContact,
    },
    { new: true }
  );

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Patient profile not found",
    });
  }

  res.status(200).json({
    success: true,
    message: "patient created successfully",
    patient,
  });
});

export const sendVerificationLink = AsyncHandler(async (req, res) => {
  const { userId, email } = req.body;

  let user;

  // Find user by ID or email
  if (userId) {
    user = await User.findById(userId);
  } else if (email) {
    user = await User.findOne({ email });
  } else {
    throw new ErrorHandler("User ID or email is required", 400);
  }

  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  if (user.isEmailVerified) {
    return res.status(200).json({
      success: true,
      message: "Email is already verified",
    });
  }

  // Generate verification token
  const token = crypto.randomBytes(32).toString("hex");

  // Set token and expiry (24 hours)
  user.verificationToken = token;
  user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  // Send verification email
  const emailSent = await sendVerificationEmail(user, token);

  if (!emailSent) {
    throw new ErrorHandler("Failed to send verification email", 500);
  }

  res.status(200).json({
    success: true,
    message: "Verification email sent successfully",
  });
});

// Verify email with token
export const verifyEmail = AsyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new ErrorHandler("Invalid verification link", 400);
  }

  try {
    // Decrypt the token to get user id and verification token
    const decrypted = decryptData(token);

    const user = await User.findOne({
      _id: decrypted.id,
      verificationToken: decrypted.token,
      verificationTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      throw new ErrorHandler("Invalid or expired verification link", 400);
    }

    // Mark as verified and remove token
    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    throw new ErrorHandler("Invalid verification link", 400);
  }
});

export const logout = AsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const sessionToken = req.headers["x-session-token"];

  if (sessionToken) {
    await endSession(userId, sessionToken);
  }

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export const getSessionStatus = AsyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "lastLoginAt lastLoginIP sessionExpiresAt"
  );

  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  res.status(200).json({
    success: true,
    sessionStatus: {
      lastLogin: user.lastLoginAt,
      lastLoginIP: user.lastLoginIP,
      sessionExpiresAt: user.sessionExpiresAt,
    },
  });
});
export const getSessionHistory = AsyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("loginHistory");

  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  res.status(200).json({
    success: true,
    sessionHistory: user.loginHistory || [],
  });
});
