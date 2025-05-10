import { body, validationResult, param, query } from "express-validator";

export const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 50 })
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage("name must be between 2 and 50 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),

  body("password")
    .trim()
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character"
    ),

  body("role")
    .trim()
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["patient", "doctor", "receptionist", "admin"])
    .withMessage("Role must be either 'patient', 'doctor', or 'admin'"),
];

export const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),

  body("password")
    .trim()
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character"
    ),
];

export const updatePatientProfile = [
  body("firstName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters")
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage(
      "First name can only contain letters, spaces, hyphens and apostrophes"
    ),

  body("lastName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters")
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage(
      "Last name can only contain letters, spaces, hyphens and apostrophes"
    ),

  body("contactNumber")
    .optional()
    .trim()
    .matches(/^\d{10}$/)
    .withMessage("Phone number must be exactly 10 digits"),

  body("dateOfBirth")
    .optional()
    .trim()
    .isISO8601()
    .withMessage("Please enter a valid date in YYYY-MM-DD format")
    .isBefore(new Date().toISOString())
    .withMessage("Date of birth must be a past date"),

  body("gender")
    .optional()
    .trim()
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender selection"),

  body("address")
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage("Address must be between 5 and 100 characters"),

  body("emergencyContact.name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Emergency contact name must be between 2 and 50 characters"),

  body("emergencyContact.relationship")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Emergency contact relationship is required"),

  body("emergencyContact.contactNumber")
    .optional()
    .trim()
    .matches(/^\d{10}$/)
    .withMessage("Emergency contact number must be exactly 10 digits"),
];

export const updateDoctorProfile = [
  body("firstName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters")
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage(
      "First name can only contain letters, spaces, hyphens and apostrophes"
    ),

  body("lastName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters")
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage(
      "Last name can only contain letters, spaces, hyphens and apostrophes"
    ),

  body("specialization")
    .optional()
    .isIn([
      "cardiology",
      "dermatology",
      "neurology",
      "orthopedics",
      "pediatrics",
      "psychiatry",
      "gynecology",
      "ophthalmology",
      "dentistry",
      "general",
    ])
    .withMessage("Invalid specialization"),

  body("qualification")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Qualification must be between 2 and 100 characters"),

  body("experience")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Experience must be a non-negative integer"),

  body("contactNumber")
    .optional()
    .trim()
    .matches(/^\d{10}$/)
    .withMessage("Contact number must be exactly 10 digits"),
];

export const createApponiment = [
  body("doctorId")
    .notEmpty()
    .withMessage("Doctor ID is required")
    .isMongoId()
    .withMessage("Invalid doctor ID format"),

  body("date")
    .notEmpty()
    .withMessage("Date is required")
    .isISO8601()
    .withMessage("Invalid date format")
    .custom((value) => {
      const appointmentDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (appointmentDate < today) {
        throw new Error("Cannot book appointments for past dates");
      }
      return true;
    }),

  body("reason")
    .notEmpty()
    .withMessage("Reason is required")
    .isLength({ min: 10, max: 500 })
    .withMessage("Reason must be between 10 and 500 characters")
    .trim()
    .escape(),

  body("department")
    .notEmpty()
    .withMessage("Department is required")
    .isIn([
      "cardiology",
      "dermatology",
      "neurology",
      "orthopedics",
      "pediatrics",
      "psychiatry",
      "gynecology",
      "ophthalmology",
      "dentistry",
      "general",
    ])
    .withMessage("Invalid department selected"),
];

// Add this validation to your existing validators
export const createAppointmentForPatientValidation = [
  body("patientId").notEmpty().withMessage("Patient ID is required"),
  body("doctorId").notEmpty().withMessage("Doctor ID is required"),
  body("department")
    .notEmpty()
    .withMessage("Department is required")
    .isIn([
      "cardiology",
      "dermatology",
      "neurology",
      "orthopedics",
      "pediatrics",
      "psychiatry",
      "gynecology",
      "ophthalmology",
      "dentistry",
      "general",
    ])
    .withMessage("Invalid department"),
  body("date")
    .notEmpty()
    .withMessage("Date is required")
    .custom((value) => {
      const appointmentDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (appointmentDate < today) {
        throw new Error("Cannot book appointments for past dates");
      }
      return true;
    }),
  body("reason").notEmpty().withMessage("Reason is required"),
];

export const startConsultationValidation = [
  param("appointmentId")
    .isMongoId()
    .withMessage("Invalid appointment ID format"),
];

export const completeConsultationValidation = [
  param("appointmentId")
    .isMongoId()
    .withMessage("Invalid appointment ID format"),
];

export const getAppointmentDetailValidation = [
  param("appointmentId")
    .isMongoId()
    .withMessage("Invalid appointment ID format"),
];

export const getAllDoctorAppointmentsValidation = [
  param("doctorId").isMongoId().withMessage("Invalid doctor ID format"),

  query("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be in YYYY-MM-DD format"),
];

export const getAllDoctorsByDepartmentValidation = [
  param("department")
    .isIn([
      "cardiology",
      "dermatology",
      "neurology",
      "orthopedics",
      "pediatrics",
      "psychiatry",
      "gynecology",
      "ophthalmology",
      "dentistry",
      "general",
    ])
    .withMessage("Invalid department specified"),
];

export const updateDoctorAvailabilityValidation = [
  body("availability").isArray().withMessage("Availability must be an array"),

  body("availability.*.day")
    .isIn([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
    .withMessage("Invalid day specified"),

  body("availability.*.startTime")
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("Start time must be in HH:MM format (24-hour)"),

  body("availability.*.endTime")
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("End time must be in HH:MM format (24-hour)")
    .custom((endTime, { req, path }) => {
      const index = path.match(/\[(\d+)\]/)?.[1];
      if (index === undefined) return true;

      const startTime = req.body.availability[index].startTime;
      if (!startTime) return true;

      if (endTime <= startTime) {
        throw new Error("End time must be later than start time");
      }
      return true;
    }),

  body("availability.*.isAvailable")
    .isBoolean()
    .withMessage("isAvailable must be a boolean value"),
];

export const getMedicalHistoryValidation = [];

export const getPatientAppointmentsValidation = [];

export const changePassword = [
  body("oldPassword")
    .trim()
    .notEmpty()
    .withMessage("Old password is required")
    .isLength({ min: 6 })
    .withMessage("Old password must be at least 6 characters long"),

  body("newPassword")
    .trim()
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters long")
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    .withMessage(
      "New password must contain at least one uppercase letter, one lowercase letter, one number and one special character"
    ),
];

// Add this to your existing validators
export const createPatientAccountValidator = [
  // Personal Information - Required Fields
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters")
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage(
      "First name can only contain letters, spaces, hyphens and apostrophes"
    ),

  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters")
    .matches(/^[A-Za-z\s\-']+$/)
    .withMessage(
      "Last name can only contain letters, spaces, hyphens and apostrophes"
    ),

  body("contactNumber")
    .trim()
    .notEmpty()
    .withMessage("Contact number is required")
    .matches(/^\d{10,15}$/)
    .withMessage("Please enter a valid phone number (10-15 digits)"),

  body("dateOfBirth")
    .notEmpty()
    .withMessage("Date of birth is required")
    .isDate()
    .withMessage("Please enter a valid date")
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();

      if (birthDate > today) {
        throw new Error("Date of birth cannot be in the future");
      }

      const age = today.getFullYear() - birthDate.getFullYear();
      if (age > 120) {
        throw new Error("Invalid date of birth");
      }

      return true;
    }),

  body("gender")
    .notEmpty()
    .withMessage("Gender is required")
    .isIn(["male", "female", "other"])
    .withMessage("Gender must be male, female, or other"),

  // Account Information - Optional Fields
  body("email")
    .optional({ nullable: true })
    .isEmail()
    .withMessage("Please enter a valid email address")
    .normalizeEmail(),

  body("password")
    .optional({ nullable: true })
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  // Additional Information - Optional Fields
  body("address")
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Address must be between 5 and 200 characters"),

  // Emergency Contact - Optional Nested Fields
  body("emergencyContact.name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Emergency contact name must be between 2 and 50 characters"),

  body("emergencyContact.relationship")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Relationship must be between 2 and 50 characters"),

  body("emergencyContact.contactNumber")
    .optional()
    .trim()
    .matches(/^\d{10,15}$/)
    .withMessage(
      "Please enter a valid emergency contact number (10-15 digits)"
    ),
];
export const processValidationResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error(errors.array()[0].msg);
    error.statusCode = 400;
    return next(error);
  }
  next();
};
