import express from "express";
import { AuthCheck, authorizeRole } from "../middleware/AuthCheck.js";
import * as appoinmentController from "../controller/Appoinment.js";
import {
  createApponiment,
  startConsultationValidation,
  completeConsultationValidation,
  getAppointmentDetailValidation,
  getAllDoctorAppointmentsValidation,
  getMedicalHistoryValidation,
  getPatientAppointmentsValidation,
  processValidationResult,
  createAppointmentForPatientValidation,
} from "../utils/Validator.js";

const router = express.Router();

router.post(
  "/create",
  AuthCheck,
  authorizeRole("patient", "receptionist"),
  createApponiment,
  processValidationResult,
  appoinmentController.createAppoinment
);

router.put(
  "/start/:appointmentId",
  AuthCheck,
  authorizeRole("doctor"),
  startConsultationValidation,
  processValidationResult,
  appoinmentController.startConsultation
);

router.put(
  "/complete/:appointmentId",
  AuthCheck,
  authorizeRole("doctor"),
  completeConsultationValidation,
  processValidationResult,
  appoinmentController.completeConsultation
);

router.get(
  "/get-all-appoinement-patient",
  AuthCheck,
  getPatientAppointmentsValidation,
  processValidationResult,
  appoinmentController.getPatientAppointments
);

router.get(
  "/get-appoinement-detail-patient/:appointmentId",
  AuthCheck,
  getAppointmentDetailValidation,
  processValidationResult,
  appoinmentController.getAppoinemtDataForPatient
);

router.get(
  "/medical-history",
  AuthCheck,
  getMedicalHistoryValidation,
  processValidationResult,
  appoinmentController.getMedicalHistory
);

router.get(
  "/get-all-appoinment-doctor/:doctorId",
  AuthCheck,
  getAllDoctorAppointmentsValidation,
  processValidationResult,
  appoinmentController.getAllAppoinmentsDoctor
);

router.get("/queue/:queueId", AuthCheck, appoinmentController.getQueue);

router.get("/today", AuthCheck, appoinmentController.getTodayQueues);

router.post(
  "/create-for-patient",
  AuthCheck,
  authorizeRole("admin", "receptionist"),
  createAppointmentForPatientValidation, // Add the validation
  processValidationResult,
  appoinmentController.createAppointmentForPatient
);
export default router;
