import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ErrorHandler } from "../utils/ErrorHandler.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["patient", "doctor", "receptionist", "admin"],
    },
    name: {
      type: String,
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      default: null,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpiry: Date,
    sessionToken: String,
    sessionExpiresAt: Date,
    lastLoginAt: Date,
    lastLoginIP: String,
    lastLogoutAt: Date,
    loginHistory: [
      {
        loginTime: Date,
        logoutTime: Date,
        ipAddress: String,
        userAgent: String,
        sessionToken: String,
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new ErrorHandler("Invalid email or password", 401);
  }
};

const User = mongoose.model("User", userSchema);

export default User;
