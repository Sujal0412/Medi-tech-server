import express from "express";
import * as user from "../controller/user.js";
import * as validation from "../utils/Validator.js";
import { AuthCheck, SessionCheck } from "../middleware/AuthCheck.js";

const router = express.Router();

router.post(
  "/register",
  validation.registerValidation,
  validation.processValidationResult,
  user.register
);

router.post(
  "/login",
  validation.loginValidation,
  validation.processValidationResult,
  user.login
);

router.post("/change-password", AuthCheck, user.changePassword);

router.get("/me", AuthCheck, user.getuser);

router.post(
  "/create-patient",
  AuthCheck,
  validation.createPatientAccountValidator,
  user.createAccountPatient
);

router.post("/send", AuthCheck, user.sendVerificationLink);

// Public route to verify email
router.post("/verify", user.verifyEmail);
router.post("/logout", AuthCheck, SessionCheck, user.logout);
router.get("/session-status", AuthCheck, SessionCheck, user.getSessionStatus);
router.get("/session-history", AuthCheck, SessionCheck, user.getSessionHistory);
export default router;
