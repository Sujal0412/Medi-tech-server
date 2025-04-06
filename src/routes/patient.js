import express from "express";
import { AuthCheck, authorizeRole } from "../middleware/AuthCheck.js";
import * as patient from "../controller/patient.js";
import * as validation from "../utils/Validator.js";
const router = express.Router();

router.get(
  "/get-profile",
  AuthCheck,
  authorizeRole("patient"),
  patient.getProfile
);

router.put(
  "/profile",
  AuthCheck,
  authorizeRole("patient"),
  validation.updatePatientProfile,
  validation.processValidationResult,
  patient.updateProfile
);

router.get(
  "/:id",
  AuthCheck,
  authorizeRole("admin", "receptionist", "doctor"),
  patient.findPatientById
);

router.get(
  "/search/query",
  AuthCheck,
  authorizeRole("admin", "receptionist", "doctor"),
  patient.searchPatients
);

router.get(
  "/dashboard/info",
  AuthCheck,
  authorizeRole("patient"),
  patient.getPatientDashboard
);

export default router;
