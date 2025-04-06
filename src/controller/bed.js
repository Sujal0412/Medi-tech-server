import Bed from "../models/bed.js";
import Patient from "../models/patient.js";
import mongoose from "mongoose";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import Queue from "../models/queue.js";
import Doctor from "../models/doctor.js";
import Appointment from "../models/appoinment.js";

// @desc    Get all beds
// @route   GET /api/beds
// @access  Private
export const getAllBeds = AsyncHandler(async (req, res, next) => {
  const {
    status,
    type,
    ward,
    floor,
    search,
    department,
    isPrivate,
    sort = "bedId",
    order = "asc",
  } = req.query;

  // Build query
  const query = { isActive: true };

  if (status && status !== "all") query.status = status;
  if (type && type !== "all") query.type = type;
  if (ward && ward !== "all") query.ward = ward;
  if (floor && floor !== "all") query.floor = floor;
  if (department && department !== "all") query.department = department;
  if (isPrivate !== undefined) query.isPrivate = isPrivate === "true";

  // Handle search
  if (search) {
    query.$or = [
      { bedId: { $regex: search, $options: "i" } },
      { ward: { $regex: search, $options: "i" } },
      { "patientDetails.name": { $regex: search, $options: "i" } },
      { "patientDetails.patientId": { $regex: search, $options: "i" } },
    ];
  }

  // Get beds with sorting
  const sortDirection = order === "desc" ? -1 : 1;
  const beds = await Bed.find(query).sort({ [sort]: sortDirection });

  // Get stats for dashboard
  const stats = await Bed.getBedStats();

  // Get unique options for filters
  const types = await Bed.distinct("type");
  const wards = await Bed.distinct("ward");
  const floors = await Bed.distinct("floor");

  res.status(200).json({
    success: true,
    count: beds.length,
    beds,
    stats,
    metadata: {
      types,
      wards,
      floors,
    },
  });
});

// @desc    Get single bed
// @route   GET /api/beds/:id
// @access  Private
export const getBed = AsyncHandler(async (req, res, next) => {
  const bed = await Bed.findOne({ bedId: req.params.id }).populate({
    path: "currentPatient",
    select: "firstName lastName contactNumber dateOfBirth gender",
  });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    bed,
  });
});

// @desc    Create new bed
// @route   POST /api/beds
// @access  Private (Admin & Reception)
export const createBed = AsyncHandler(async (req, res, next) => {
  const {
    bedId,
    type,
    ward,
    floor,
    status,
    department,
    isPrivate,
    equipments,
  } = req.body;

  // Check if bed ID already exists
  const existingBed = await Bed.findOne({ bedId });
  if (existingBed) {
    return next(new ErrorHandler(`Bed with ID ${bedId} already exists`, 400));
  }

  const bed = await Bed.create({
    bedId,
    type,
    ward,
    floor,
    status: status || "Available",
    department,
    isPrivate,
  });

  res.status(201).json({
    success: true,
    message: "Bed created successfully",
    bed,
  });
});

// @desc    Update bed
// @route   PUT /api/beds/:id
// @access  Private (Admin & Reception)
export const updateBed = AsyncHandler(async (req, res, next) => {
  const {
    type,
    ward,
    floor,
    status,
    department,
    isPrivate,
    equipments,
    isActive,
  } = req.body;

  const bed = await Bed.findOne({ bedId: req.params.id });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  // Update fields
  if (type) bed.type = type;
  if (ward) bed.ward = ward;
  if (floor) bed.floor = floor;
  if (status) bed.status = status;
  if (department) bed.department = department;
  if (isPrivate !== undefined) bed.isPrivate = isPrivate;
  if (equipments) bed.equipments = equipments;
  if (isActive !== undefined) bed.isActive = isActive;

  await bed.save();

  res.status(200).json({
    success: true,
    message: "Bed updated successfully",
    bed,
  });
});

// @desc    Assign patient to bed
// @route   PUT /api/beds/:id/assign
// @access  Private
export const assignPatient = AsyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    name,
    id: patientIdentifier,
    admissionDate,
    expectedDischarge,
    reason,
    notes,
  } = req.body;

  // Find the bed by bedId
  const bed = await Bed.findOne({ bedId: id });
  if (!bed) {
    return next(new ErrorHandler(`Bed not found with ID: ${id}`, 404));
  }

  // Assign patient to the bed
  await bed.assignPatient({
    name,
    patientIdentifier,
    admissionDate,
    expectedDischarge,
    reason,
    notes,
  });

  res.status(200).json({
    success: true,
    message: "Patient assigned successfully",
    bed,
  });
});

// @desc    Discharge patient
// @route   PUT /api/beds/:id/discharge
// @access  Private
export const dischargePatient = AsyncHandler(async (req, res, next) => {
  const { notes } = req.body;

  const bed = await Bed.findOne({ bedId: req.params.id });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  if (bed.status !== "Occupied") {
    return next(new ErrorHandler(`Bed has no patient to discharge`, 400));
  }

  // Discharge patient from bed
  await bed.dischargePatient(notes);

  res.status(200).json({
    success: true,
    message: "Patient discharged successfully",
    bed,
  });
});

// @desc    Set bed to maintenance
// @route   PUT /api/beds/:id/maintenance
// @access  Private (Admin & Reception)
export const setBedMaintenance = AsyncHandler(async (req, res, next) => {
  const { notes } = req.body;

  const bed = await Bed.findOne({ bedId: req.params.id });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  // Ensure bed is not occupied
  if (bed.status === "Occupied") {
    return next(
      new ErrorHandler(
        `Cannot set occupied bed to maintenance. Please discharge patient first.`,
        400
      )
    );
  }

  // Set maintenance using the model method
  await bed.setMaintenance(notes);

  res.status(200).json({
    success: true,
    message: "Bed set to maintenance successfully",
    bed,
  });
});

// @desc    Get bed availability report
// @route   GET /api/beds/reports/availability
// @access  Private (Admin)
export const getBedAvailabilityReport = AsyncHandler(async (req, res, next) => {
  // Get counts by type
  const typeReport = await Bed.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$type",
        total: { $sum: 1 },
        available: {
          $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] },
        },
        occupied: {
          $sum: { $cond: [{ $eq: ["$status", "Occupied"] }, 1, 0] },
        },
        maintenance: {
          $sum: { $cond: [{ $eq: ["$status", "Maintenance"] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Get counts by ward
  const wardReport = await Bed.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$ward",
        total: { $sum: 1 },
        available: {
          $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] },
        },
        occupied: {
          $sum: { $cond: [{ $eq: ["$status", "Occupied"] }, 1, 0] },
        },
        maintenance: {
          $sum: { $cond: [{ $eq: ["$status", "Maintenance"] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({
    success: true,
    typeReport,
    wardReport,
  });
});

// @desc    Delete bed
// @route   DELETE /api/beds/:id
// @access  Private (Admin only)
export const deleteBed = AsyncHandler(async (req, res, next) => {
  const bed = await Bed.findOne({ bedId: req.params.id });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  // Prevent deletion of occupied beds
  if (bed.status === "Occupied") {
    return next(new ErrorHandler("Cannot delete an occupied bed", 400));
  }

  await Bed.deleteOne({ _id: bed._id });

  res.status(200).json({
    success: true,
    message: "Bed deleted successfully",
  });
});

export const transferPatient = AsyncHandler(async (req, res, next) => {
  const { fromBedId, toBedId, reason, notes } = req.body;

  if (!fromBedId || !toBedId) {
    return next(
      new ErrorHandler("Source and destination bed IDs are required", 400)
    );
  }

  if (fromBedId === toBedId) {
    return next(
      new ErrorHandler("Source and destination beds cannot be the same", 400)
    );
  }

  try {
    const result = await Bed.transferPatient(fromBedId, toBedId, reason, notes);

    res.status(200).json({
      success: true,
      message: "Patient transferred successfully",
      sourceBed: result.sourceBed,
      destinationBed: result.destBed,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const findAvailableBeds = AsyncHandler(async (req, res, next) => {
  const { type, ward, floor, department, isPrivate } = req.query;

  // Build query - only show available beds
  const query = {
    status: "Available",
    isActive: true,
  };

  // Add optional filters
  if (type) query.type = type;
  if (ward) query.ward = ward;
  if (floor) query.floor = floor;
  if (department) query.department = department;
  if (isPrivate !== undefined) query.isPrivate = isPrivate === "true";

  // Find available beds
  const beds = await Bed.find(query)
    .sort({ bedId: 1 })
    .select("bedId type ward floor department isPrivate");

  // Group by type for easier UI display
  const groupedBeds = beds.reduce((acc, bed) => {
    const type = bed.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(bed);
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    count: beds.length,
    beds: groupedBeds,
  });
});

// Add these missing controller functions

// @desc    Clear bed from maintenance
// @route   PUT /api/beds/:id/maintenance/clear
// @access  Private (Admin & Reception)
export const clearBedMaintenance = AsyncHandler(async (req, res, next) => {
  const bed = await Bed.findOne({ bedId: req.params.id });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  if (bed.status !== "Maintenance") {
    return next(new ErrorHandler(`Bed is not currently in maintenance`, 400));
  }

  await bed.clearMaintenance();

  res.status(200).json({
    success: true,
    message: "Bed maintenance cleared successfully",
    bed,
  });
});

// @desc    Get bed occupancy history
// @route   GET /api/beds/:id/history
// @access  Private
export const getBedHistory = AsyncHandler(async (req, res, next) => {
  const bed = await Bed.findOne({ bedId: req.params.id });

  if (!bed) {
    return next(
      new ErrorHandler(`Bed not found with ID: ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: {
      bedId: bed.bedId,
      ward: bed.ward,
      type: bed.type,
      history: bed.occupancyHistory || [],
    },
  });
});

// @desc    Get upcoming discharges
// @route   GET /api/beds/upcoming-discharges
// @access  Private
export const getUpcomingDischarges = AsyncHandler(async (req, res, next) => {
  const { days = 3 } = req.query; // Default to next 3 days

  try {
    const beds = await Bed.getUpcomingDischarges(parseInt(days));

    // Format the results
    const formattedResults = beds.map((bed) => ({
      bedId: bed.bedId,
      type: bed.type,
      ward: bed.ward,
      floor: bed.floor,
      patient: {
        name: bed.patientDetails.name,
        id: bed.patientDetails.patientId,
        admissionDate: bed.patientDetails.admissionDate,
        expectedDischarge: bed.patientDetails.expectedDischargeDate,
        stayDuration: Math.round(
          (new Date(bed.patientDetails.expectedDischargeDate) -
            new Date(bed.patientDetails.admissionDate)) /
            (1000 * 60 * 60 * 24)
        ), // Days
      },
    }));

    res.status(200).json({
      success: true,
      count: formattedResults.length,
      data: formattedResults,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Add a new function for dashboard statistics

// @desc    Get dashboard statistics
// @route   GET /api/beds/dashboard
// @access  Private
export const getDashboardStats = AsyncHandler(async (req, res, next) => {
  // Get basic bed stats
  const bedStats = await Bed.getBedStats();

  // Get beds by type
  const bedsByType = await Bed.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  // Get beds by ward
  const bedsByWard = await Bed.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$ward", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  // Get upcoming discharges count (next 3 days)
  const today = new Date();
  const threeDaysLater = new Date();
  threeDaysLater.setDate(today.getDate() + 3);

  const upcomingDischarges = await Bed.countDocuments({
    status: "Occupied",
    "patientDetails.expectedDischargeDate": {
      $gte: today,
      $lte: threeDaysLater,
    },
  });

  // Get recent occupancy history (last 10 entries)
  const recentHistory = await Bed.aggregate([
    { $unwind: "$occupancyHistory" },
    { $sort: { "occupancyHistory.dischargeDate": -1 } },
    { $limit: 10 },
    {
      $project: {
        bedId: 1,
        patientName: "$occupancyHistory.patientName",
        admissionDate: "$occupancyHistory.admissionDate",
        dischargeDate: "$occupancyHistory.dischargeDate",
        stayDuration: {
          $divide: [
            {
              $subtract: [
                "$occupancyHistory.dischargeDate",
                "$occupancyHistory.admissionDate",
              ],
            },
            1000 * 60 * 60 * 24, // Convert to days
          ],
        },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      bedStats,
      bedsByType,
      bedsByWard,
      upcomingDischarges,
      recentHistory,
    },
  });
});

export const getReceptionistStats = AsyncHandler(async (req, res) => {
  // Get today's date range
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  // Calculate statistics
  const [todayPatients, availableBeds, queueStats, availableDoctors] =
    await Promise.all([
      // Today's patients (appointments)
      Appointment.countDocuments({
        date: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Available beds
      Bed.countDocuments({ status: "Available", isActive: true }),

      // Queue statistics
      Queue.aggregate([
        { $match: { date: { $gte: startOfDay, $lt: endOfDay } } },
        { $unwind: "$patients" },
        {
          $group: {
            _id: "$patients.status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Available doctors today
      Doctor.countDocuments({
        "availability.day": new Intl.DateTimeFormat("en-US", {
          weekday: "long", // Use "long" instead of "lowercase"
        })
          .format(today)
          .toLowerCase(), // Convert to lowercase after formatting
        "availability.isAvailable": true,
        isActive: true,
      }),
    ]);

  // Process queue stats
  const queueLength =
    queueStats.find((stat) => stat._id === "waiting")?.count || 0;
  const inProgress =
    queueStats.find((stat) => stat._id === "in-progress")?.count || 0;
  const completed =
    queueStats.find((stat) => stat._id === "completed")?.count || 0;

  res.status(200).json({
    success: true,
    stats: {
      todayPatients,
      availableBeds,
      queueLength,
      waitingPatients: queueLength,
      inProgressPatients: inProgress,
      completedPatients: completed,
      availableDoctors,
    },
  });
});

// Get recent patients for the dashboard
export const getRecentPatients = AsyncHandler(async (req, res) => {
  const { limit = 5 } = req.query;

  // Get recent appointments with patient details
  const recentAppointments = await Appointment.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate({
      path: "patient",
      select:
        "firstName lastName patientIdentifier contactNumber dateOfBirth gender",
      populate: {
        path: "user",
        select: "name email",
      },
    })
    .populate({
      path: "doctor",
      select: "firstName lastName specialization",
    })
    .lean();

  // Format the response
  const patients = recentAppointments.map((appointment) => {
    return {
      id: appointment.patient?.patientIdentifier,
      _id: appointment.patient?._id,
      name: `${appointment.patient?.firstName} ${appointment.patient?.lastName}`,
      time: new Date(appointment.estimatedStartTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      date: new Date(appointment.date).toLocaleDateString(),
      status: appointment.status,
      doctor: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName}`,
      specialization: appointment.doctor?.specialization,
      contact: appointment.patient?.contactNumber,
      email: appointment.patient?.user?.email,
      appointmentId: appointment._id,
    };
  });

  res.status(200).json({
    success: true,
    count: patients.length,
    patients,
  });
});

// Get bed allocation summary
export const getBedSummary = AsyncHandler(async (req, res) => {
  // Get bed statistics by type and status
  const bedStats = await Bed.aggregate([
    {
      $group: {
        _id: {
          type: "$type",
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.type": 1, "_id.status": 1 } },
  ]);

  // Organize by bed type
  const bedSummary = {};

  bedStats.forEach((stat) => {
    const { type, status } = stat._id;

    if (!bedSummary[type]) {
      bedSummary[type] = {
        total: 0,
        available: 0,
        occupied: 0,
      };
    }

    bedSummary[type].total += stat.count;

    if (status === "Available") {
      bedSummary[type].available += stat.count;
    } else if (status === "Occupied") {
      bedSummary[type].occupied += stat.count;
    }
  });

  res.status(200).json({
    success: true,
    bedSummary,
  });
});
