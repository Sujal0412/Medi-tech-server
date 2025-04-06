import mongoose from "mongoose";

const patientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },
  dateOfBirth: {
    type: String,
    set: (val) => (val ? new Date(val).toISOString().split("T")[0] : val),
  },
  gender: { type: String, enum: ["male", "female", "other"], default: "male" },
  contactNumber: { type: String, default: "" },
  address: { type: String, default: "" },
  emergencyContact: {
    name: { type: String, default: "" },
    relationship: { type: String, default: "" },
    contactNumber: { type: String, default: "" },
  },
  registrationDate: { type: Date, default: Date.now },
  consultationHistory: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
  ],
  currentBed: {
    type: String, // Store bedId directly
    default: null,
  },
  occupancyHistory: [
    {
      patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
      },
      patientName: String,
      patientIdentifier: String,
      admissionDate: Date,
      dischargeDate: Date,
      reason: String,
      notes: String,
      dischargeSummary: String,
    },
  ],
  patientIdentifier: {
    type: String,
    unique: true,
    required: true,
  },
});

// Add these methods if they're missing

// Method to admit patient to a bed
patientSchema.methods.admitToBed = async function (bedData, doctorId) {
  // Add to admission history
  if (!this.admissionHistory) {
    this.admissionHistory = [];
  }

  this.admissionHistory.push({
    bedId: bedData.bedId,
    ward: bedData.ward,
    admissionDate: new Date(),
    reason: bedData.reason || "General admission",
    notes: bedData.notes || "",
    doctor: doctorId || null,
  });

  // Update current bed
  this.currentBed = bedData.bedId;

  await this.save();
  return this;
};

// Method to discharge patient from bed
patientSchema.methods.dischargeFromBed = async function (notes) {
  // If not admitted, throw error
  if (!this.currentBed) {
    throw new Error("Patient is not currently admitted");
  }

  // Find the current admission record and update it
  const currentAdmission = this.admissionHistory.find(
    (record) => record.bedId === this.currentBed && !record.dischargeDate
  );

  if (currentAdmission) {
    currentAdmission.dischargeDate = new Date();
    currentAdmission.dischargeNotes = notes || "";
  }

  // Clear current bed
  this.currentBed = null;

  await this.save();
  return this;
};
const Patient =
  mongoose.models.Patient || mongoose.model("Patient", patientSchema);

export default Patient;
