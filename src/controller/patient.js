import { AsyncHandler } from "../utils/AsyncHandler.js";
import mongoose from "mongoose";
import Patient from "../models/patient.js";
import Appointment from "../models/appoinment.js";
import Queue from "../models/queue.js";
export const updateProfile = AsyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    dateOfBirth,
    gender,
    contactNumber,
    address,
    emergencyContact,
  } = req.body;

  const patient = await Patient.findOneAndUpdate(
    { user: req.user._id },
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
    message: "Profile updated successfully",
    patient,
  });
});

export const getProfile = AsyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ user: req.user._id });
  if (!patient) {
    return res.status(404).json({ message: "Patient not found" });
  }
  res.status(200).json({ patient });
});

// Add this function to your existing patient controller
export const findPatientById = AsyncHandler(async (req, res) => {
  const { id } = req.params;

  let patient;

  // Try to find by MongoDB ObjectId first (if valid)
  if (mongoose.Types.ObjectId.isValid(id)) {
    patient = await Patient.findById(id).select("-__v");
  }

  // If not found, try to find by patientIdentifier
  if (!patient) {
    patient = await Patient.findOne({ patientIdentifier: id }).select("-__v");
  }

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Patient not found",
    });
  }

  res.status(200).json({
    success: true,
    patient,
  });
});

// Add this helper function to search patients by name/ID
export const searchPatients = AsyncHandler(async (req, res) => {
  const { query, limit = 10, includeAppointments = false } = req.query;

  if (!query || query.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Search query must be at least 2 characters",
    });
  }

  // Base patient query
  const searchQuery = {
    $or: [
      { firstName: { $regex: query, $options: "i" } },
      { lastName: { $regex: query, $options: "i" } },
      { patientIdentifier: { $regex: query, $options: "i" } },
      { contactNumber: { $regex: query, $options: "i" } },
    ],
  };

  let patients = [];

  if (includeAppointments === "true") {
    // Get patients with their latest appointment
    patients = await Patient.aggregate([
      { $match: searchQuery },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "appointments",
          localField: "_id",
          foreignField: "patient",
          as: "appointments",
        },
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          patientIdentifier: 1,
          gender: 1,
          dateOfBirth: 1,
          contactNumber: 1,
          latestAppointment: {
            $arrayElemAt: [
              { $sortArray: { input: "$appointments", sortBy: { date: -1 } } },
              0,
            ],
          },
        },
      },
    ]);

    // Format response for frontend
    patients = patients.map((p) => ({
      id: p.patientIdentifier,
      _id: p._id,
      name: `${p.firstName} ${p.lastName}`,
      gender: p.gender,
      dateOfBirth: p.dateOfBirth,
      contactNumber: p.contactNumber,
      appointmentStatus: p.latestAppointment?.status || "No Appointment",
      appointmentDate: p.latestAppointment
        ? new Date(p.latestAppointment.date).toLocaleDateString()
        : null,
      appointmentTime: p.latestAppointment?.estimatedStartTime
        ? new Date(p.latestAppointment.estimatedStartTime).toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }
          )
        : null,
    }));
  } else {
    // Basic patient search without appointments
    patients = await Patient.find(searchQuery)
      .select(
        "firstName lastName patientIdentifier gender contactNumber dateOfBirth"
      )
      .limit(parseInt(limit));

    // Format response for frontend
    patients = patients.map((p) => ({
      id: p.patientIdentifier,
      _id: p._id,
      name: `${p.firstName} ${p.lastName}`,
      gender: p.gender,
      dateOfBirth: p.dateOfBirth,
      contactNumber: p.contactNumber,
    }));
  }

  res.status(200).json({
    success: true,
    count: patients.length,
    patients,
  });
});

export const getPatientDashboard = AsyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get patient profile data
  const patient = await Patient.findOne({ user: userId }).lean();

  if (!patient) {
    throw new ErrorHandler("Patient profile not found", 404);
  }

  // Get today's date range
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  // Get upcoming appointments (today + future)
  const upcomingAppointments = await Appointment.find({
    patient: patient._id,
    date: { $gte: startOfDay },
    status: { $in: ["scheduled", "in-progress"] },
  })
    .populate({
      path: "doctor",
      select:
        "firstName lastName specialization consultationDuration profilePicture",
    })
    .sort({ date: 1, estimatedStartTime: 1 })
    .limit(5)
    .lean();

  // Get today's appointment if exists
  const todayAppointment = upcomingAppointments.find(
    (apt) => new Date(apt.date).toDateString() === new Date().toDateString()
  );

  // Get queue information if there's an appointment today
  let queueInfo = null;
  if (todayAppointment) {
    const queue = await Queue.findOne({
      "patients.appointment": todayAppointment._id,
      date: { $gte: startOfDay, $lt: endOfDay },
    }).lean();

    if (queue) {
      const queuePatient = queue.patients.find(
        (p) => p.appointment.toString() === todayAppointment._id.toString()
      );

      if (queuePatient) {
        // Calculate patients ahead and waiting time
        const patientsAhead = queue.patients.filter(
          (p) =>
            (p.status === "waiting" || p.status === "in-progress") &&
            p.tokenNumber < queuePatient.tokenNumber
        ).length;

        const estimatedWaitTimeMinutes =
          patientsAhead * todayAppointment.doctor.consultationDuration;

        const waitingTime =
          estimatedWaitTimeMinutes > 60
            ? `${Math.floor(estimatedWaitTimeMinutes / 60)} hr ${
                estimatedWaitTimeMinutes % 60
              } min`
            : `${estimatedWaitTimeMinutes} min`;

        queueInfo = {
          tokenNumber: queuePatient.tokenNumber,
          currentToken: queue.currentToken,
          status: queuePatient.status,
          estimatedStartTime:
            queuePatient.estimatedStartTime?.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
          patientsAhead,
          waitingTime,
          isMyTurn: queue.currentToken === queuePatient.tokenNumber,
        };
      }
    }
  }

  // Get recent medical history
  const recentConsultations = await Appointment.find({
    patient: patient._id,
    status: "completed",
  })
    .populate({
      path: "doctor",
      select: "firstName lastName specialization",
    })
    .sort({ date: -1 })
    .limit(3)
    .lean();

  // Format response data
  const formattedAppointments = upcomingAppointments.map((apt) => ({
    _id: apt._id,
    date: apt.date,
    formattedDate: new Date(apt.date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    time: new Date(apt.estimatedStartTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    doctor: {
      name: `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}`,
      specialization: apt.doctor.specialization,
      profilePicture: apt.doctor.profilePicture,
    },
    department: apt.department,
    reason: apt.reason,
    status: apt.status,
    isToday: new Date(apt.date).toDateString() === new Date().toDateString(),
  }));

  const formattedConsultations = recentConsultations.map((con) => ({
    _id: con._id,
    date: new Date(con.date).toLocaleDateString(),
    doctor: {
      name: `Dr. ${con.doctor.firstName} ${con.doctor.lastName}`,
      specialization: con.doctor.specialization,
    },
    department: con.department,
    reason: con.reason,
  }));

  res.status(200).json({
    success: true,
    patient: {
      _id: patient._id,
      patientId: patient.patientIdentifier,
      name: `${patient.firstName} ${patient.lastName}`,
      gender: patient.gender,
      age: calculateAge(patient.dateOfBirth),
      bloodGroup: patient.medicalInfo?.bloodGroup || "Not provided",
      contactNumber: patient.contactNumber,
    },
    appointments: formattedAppointments,
    todayQueue: queueInfo,
    recentConsultations: formattedConsultations,
  });
});

// Helper function to calculate age
function calculateAge(dateOfBirth) {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}
