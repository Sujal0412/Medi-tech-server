import express from "express";
import {
  getAllBeds,
  getBed,
  createBed,
  updateBed,
  assignPatient,
  dischargePatient,
  setBedMaintenance,
  clearBedMaintenance, // Add this missing function
  getBedAvailabilityReport,
  deleteBed,
  getDashboardStats,
  transferPatient, // Add this missing import
  findAvailableBeds, // Add this missing import
  getBedHistory, // Add this missing import
  getUpcomingDischarges,
  getRecentPatients,
  getReceptionistStats,
  getBedSummary, // Add this missing import
} from "../controller/bed.js";
import { AuthCheck, authorizeRole } from "../middleware/AuthCheck.js";

const router = express.Router();

// Base routes
router
  .route("/")
  .get(AuthCheck, getAllBeds)
  .post(AuthCheck, authorizeRole("admin", "receptionist"), createBed);

router
  .route("/:id")
  .get(AuthCheck, getBed)
  .put(AuthCheck, authorizeRole("admin", "receptionist"), updateBed)
  .delete(AuthCheck, authorizeRole("admin", "receptionist"), deleteBed);

// Special operations
router.put(
  "/:id/assign",
  AuthCheck,
  authorizeRole("admin", "receptionist", "nurse"),
  assignPatient
);

router.put(
  "/:id/discharge",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  dischargePatient
);

router.put(
  "/:id/maintenance",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  setBedMaintenance
);

// Add the maintenance clear route
router.put(
  "/:id/maintenance/clear",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  clearBedMaintenance
);

// Reports
router.get(
  "/reports/availability",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  getBedAvailabilityReport
);

// Fix the order of routes - specific routes first before parameter routes
// This prevents "/transfer" from being interpreted as "/:id"
router.post(
  "/transfer",
  AuthCheck,
  authorizeRole("admin", "receptionist", "nurse"),
  transferPatient
);

router.get("/available", AuthCheck, findAvailableBeds);

router.get(
  "/upcoming-discharges",
  AuthCheck,
  authorizeRole("admin", "receptionist", "nurse", "doctor"),
  getUpcomingDischarges
);

// Add bed history route
router.get(
  "/:id/history",
  AuthCheck,
  authorizeRole("admin", "receptionist", "doctor"),
  getBedHistory
);
// Add this route to your existing routes

// Add dashboard route - place it before /:id routes
router.get(
  "/dashboard",
  AuthCheck,
  authorizeRole("admin", "receptionist", "nurse"),
  getDashboardStats
);

router.get(
  "/receptionist/stats",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  getReceptionistStats
);

router.get(
  "/receptionist/recent-patients",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  getRecentPatients
);

router.get(
  "/receptionist/beds",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  getBedSummary
);
export default router;
