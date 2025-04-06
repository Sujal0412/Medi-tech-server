import mongoose from "mongoose";

const bedSchema = new mongoose.Schema(
  {
    bedId: {
      type: String,
      required: [true, "Bed ID is required"],
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      required: [true, "Bed type is required"],
      enum: [
        "General",
        "ICU",
        "Emergency",
        "Pediatric",
        "Maternity",
        "Special",
      ],
      default: "General",
    },
    ward: {
      type: String,
      required: [true, "Ward is required"],
      trim: true,
    },
    floor: {
      type: String,
      required: [true, "Floor is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Available", "Occupied", "Maintenance"],
      default: "Available",
    },
    currentPatient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },
    patientDetails: {
      name: String,
      patientId: String,
      admissionDate: Date,
      expectedDischargeDate: Date,
      reason: String,
      notes: String,
      patientIdentifier: String,
    },
    // Add occupancy history to track all past patients
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
    isActive: {
      type: Boolean,
      default: true,
    },
    lastMaintenance: Date,
    maintenanceNotes: String,
    department: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Methods
bedSchema.methods.assignPatient = async function (patientData) {
  if (this.status !== "Available") {
    throw new Error("Bed is not available for assignment");
  }

  this.status = "Occupied";
  this.patientDetails = {
    name: patientData.name,
    patientIdentifier: patientData.patientIdentifier, // Use patientIdentifier
    admissionDate: patientData.admissionDate || new Date(),
    expectedDischargeDate: patientData.expectedDischarge,
    reason: patientData.reason || "",
    notes: patientData.notes || "",
    patientIdentifier: patientData.patientIdentifier,
  };

  await this.save();
  return this;
};

bedSchema.methods.dischargePatient = async function (notes) {
  if (this.status !== "Occupied") {
    throw new Error("Bed has no patient to discharge");
  }

  // Archive patient details to discharge history
  if (this.patientDetails) {
    this.occupancyHistory.push({
      patientIdentifier: this.patientDetails.patientIdentifier, // Use patientIdentifier
      patientName: this.patientDetails.name,
      admissionDate: this.patientDetails.admissionDate,
      dischargeDate: new Date(),
      reason: this.patientDetails.reason || "",
      notes: this.patientDetails.notes || "",
      dischargeSummary: notes || "",
    });
  }

  this.status = "Available";
  this.currentPatient = null;
  this.patientDetails = null;

  await this.save();
  return this;
};

bedSchema.methods.setMaintenance = async function (notes) {
  // Check if bed is occupied first
  if (this.status === "Occupied") {
    throw new Error(
      "Cannot set occupied bed to maintenance. Please discharge patient first."
    );
  }

  this.status = "Maintenance";
  this.lastMaintenance = new Date();
  this.maintenanceNotes = notes || "";
  await this.save();
  return this;
};

bedSchema.methods.clearMaintenance = async function () {
  if (this.status !== "Maintenance") {
    throw new Error("Bed is not currently in maintenance");
  }

  this.status = "Available";

  await this.save();
  return this;
};

// Make sure patient is properly populated
bedSchema.pre(/^find/, function (next) {
  this.populate({
    path: "currentPatient",
    select: "firstName lastName email contactNumber",
  });
  next();
});

// Static methods
bedSchema.statics.getBedStats = async function () {
  const stats = await this.aggregate([
    {
      $match: { isActive: true },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const statsObj = {
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
  };

  stats.forEach((stat) => {
    if (stat._id === "Available") statsObj.available = stat.count;
    if (stat._id === "Occupied") statsObj.occupied = stat.count;
    if (stat._id === "Maintenance") statsObj.maintenance = stat.count;
    statsObj.total += stat.count;
  });

  return statsObj;
};

// Add virtual for calculating stay duration
bedSchema.virtual("currentStayDuration").get(function () {
  if (!this.patientDetails?.admissionDate) return 0;

  const now = new Date();
  const admissionDate = new Date(this.patientDetails.admissionDate);
  const diffTime = Math.abs(now - admissionDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
});

bedSchema.statics.transferPatient = async function (
  fromBedId,
  toBedId,
  reason,
  notes
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find both beds
    const sourceBed = await this.findOne({ bedId: fromBedId }).session(session);
    const destBed = await this.findOne({ bedId: toBedId }).session(session);

    if (!sourceBed) {
      throw new Error(`Source bed ${fromBedId} not found`);
    }
    if (!destBed) {
      throw new Error(`Destination bed ${toBedId} not found`);
    }

    // Validate status
    if (sourceBed.status !== "Occupied") {
      throw new Error("Source bed is not occupied");
    }
    if (destBed.status !== "Available") {
      throw new Error("Destination bed is not available");
    }

    // Transfer patient details
    const patientDetails = sourceBed.patientDetails;
    const patientId = sourceBed.currentPatient;

    // Update destination bed
    destBed.status = "Occupied";
    destBed.currentPatient = patientId;
    destBed.patientDetails = {
      ...patientDetails,
      transferDate: new Date(),
      transferReason: reason || "Patient transfer",
      previousBedId: fromBedId,
      transferNotes: notes || "",
    };

    // Add transfer to history in source bed
    sourceBed.occupancyHistory.push({
      patientId: patientId,
      patientName: patientDetails.name,
      patientIdentifier: patientDetails.patientId,
      admissionDate: patientDetails.admissionDate,
      dischargeDate: new Date(),
      reason: patientDetails.reason,
      notes: `Transferred to bed ${toBedId}. ${reason || ""}`,
      dischargeSummary: notes || "",
    });

    // Clear source bed
    sourceBed.status = "Available";
    sourceBed.currentPatient = null;
    sourceBed.patientDetails = null;

    // Save both beds
    await sourceBed.save({ session });
    await destBed.save({ session });

    // Update patient record if available
    if (patientId) {
      const Patient = mongoose.model("Patient");
      const patient = await Patient.findById(patientId).session(session);

      if (patient) {
        // Add transfer to admission history
        const currentAdmission = patient.admissionHistory?.find(
          (record) => record.bedId === fromBedId && !record.dischargeDate
        );

        if (currentAdmission) {
          currentAdmission.dischargeDate = new Date();
          currentAdmission.dischargeNotes = `Transferred to bed ${toBedId}`;
        }

        // Add new admission record
        if (!patient.admissionHistory) {
          patient.admissionHistory = [];
        }

        patient.admissionHistory.push({
          bedId: toBedId,
          ward: destBed.ward,
          admissionDate: new Date(),
          reason: `Transfer from bed ${fromBedId}. ${reason || ""}`,
          notes: notes || "",
        });

        // Update current bed
        patient.currentBed = toBedId;

        await patient.save({ session });
      }
    }

    await session.commitTransaction();

    return { sourceBed, destBed };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Add method to search for available beds matching criteria
bedSchema.statics.findAvailableBeds = async function (criteria = {}) {
  const query = {
    status: "Available",
    isActive: true,
  };

  if (criteria.type) query.type = criteria.type;
  if (criteria.ward) query.ward = criteria.ward;
  if (criteria.floor) query.floor = criteria.floor;
  if (criteria.department) query.department = criteria.department;

  return this.find(query).sort({ bedId: 1 });
};

// Add method to get upcoming discharges
bedSchema.statics.getUpcomingDischarges = async function (days = 3) {
  const today = new Date();
  const endDate = new Date();
  endDate.setDate(today.getDate() + parseInt(days));

  return this.find({
    status: "Occupied",
    "patientDetails.expectedDischargeDate": {
      $gte: today,
      $lte: endDate,
    },
  }).sort({ "patientDetails.expectedDischargeDate": 1 });
};

const Bed = mongoose.model("Bed", bedSchema);

export default Bed;
