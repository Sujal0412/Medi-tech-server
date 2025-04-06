import { AsyncHandler } from "../utils/AsyncHandler.js";
import Doctor from "../models/doctor.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import User from "../models/user.js";
import Appointment from "../models/appoinment.js";

export const updateProfile = AsyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    specialization,
    qualification,
    experience,
    contactNumber,
    availability,
  } = req.body;

  const doctor = await Doctor.findOneAndUpdate(
    { user: req.user._id },
    {
      firstName,
      lastName,
      specialization,
      qualification,
      experience,
      contactNumber,
      availability,
    },
    { new: true }
  );

  if (!doctor) {
    throw new ErrorHandler("Doctor not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    doctor,
  });
});

export const getProfile = AsyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ user: req.user._id });

  if (!doctor) {
    throw new ErrorHandler("Doctor not found", 404);
  }

  res.status(200).json({ doctor });
});

export const getAllDoctors = AsyncHandler(async (req, res) => {
  const { department } = req.params;
  const doctors = await Doctor.find({ specialization: department })
    .populate("user", "name")
    .select("user _id firstName lastName");

  if (doctors.length === 0) {
    throw new ErrorHandler("No doctors found", 404);
  }

  res.status(200).json({ doctors });
});

