import express from "express";
import { AuthCheck, authorizeRole } from "../middleware/AuthCheck.js";
import * as doctor from "../controller/doctor.js";
import * as validation from "../utils/Validator.js";

const router = express.Router();

router.get(
  "/get-profile",
  AuthCheck,
  authorizeRole("doctor"),
  doctor.getProfile
);

router.put(
  "/profile",
  AuthCheck,
  authorizeRole("doctor"),
  validation.updateDoctorProfile,
  validation.processValidationResult,
  doctor.updateProfile
);

router.get("/get-all-doctors/:department", AuthCheck, doctor.getAllDoctors);

export default router;
