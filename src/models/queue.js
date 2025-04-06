import mongoose from "mongoose";
import Appointment from "./appoinment.js";
const QueueSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    patients: [
      {
        appointment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Appointment",
          required: true,
        },
        tokenNumber: {
          type: Number,
          required: true,
        },
        estimatedStartTime: {
          type: Date,
          required: true,
        },
        estimatedEndTime: {
          type: Date,
          required: true,
        },
        status: {
          type: String,
          enum: ["waiting", "in-progress", "completed", "no-show"],
          default: "waiting",
        },
        actualStartTime: {
          type: Date,
        },
        actualEndTime: {
          type: Date,
        },
        actualDuration: {
          type: Number, // in minutes
        },
      },
    ],
    currentToken: {
      type: Number,
      default: 0,
    },
    lastTokenNumber: {
      // Add this field
      type: Number,
      default: 0,
    },
    metrics: {
      totalPatients: {
        type: Number,
        default: 0,
      },
      averageWaitTime: {
        type: Number,
        default: 0,
      },
      averageConsultationTime: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Method to add patient to queue
QueueSchema.methods.addPatient = async function (
  appointmentId,
  startTime,
  endTime
) {
  // First verify the appointment exists
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new Error("Appointment not found");
  }

  // Check for duplicate appointment in queue
  const existingPatient = this.patients.find(
    (p) => p.appointment.toString() === appointmentId
  );
  if (existingPatient) {
    throw new Error("Patient already in queue");
  }

  // Get next token number
  const lastPatient =
    this.patients.length > 0 ? this.patients[this.patients.length - 1] : null;

  const tokenNumber = lastPatient ? lastPatient.tokenNumber + 1 : 1;
  this.lastTokenNumber = tokenNumber;

  if (lastPatient && lastPatient.status === "completed") {
    this.currentToken = tokenNumber;
  }

  // Calculate queue position and timing
  const waitingPatients = this.patients.filter(
    (p) => p.status === "waiting" || p.status === "in-progress"
  );

  let actualStartTime = new Date(startTime);

  if (waitingPatients.length > 0) {
    const lastWaitingPatient = waitingPatients[waitingPatients.length - 1];
    actualStartTime = new Date(
      Math.max(
        startTime.getTime(),
        lastWaitingPatient.estimatedEndTime.getTime()
      )
    );
  }

  const actualEndTime = new Date(
    actualStartTime.getTime() + (endTime - startTime)
  );

  try {
    // Add new patient to queue
    const newPatient = {
      appointment: appointmentId,
      tokenNumber,
      estimatedStartTime: actualStartTime,
      estimatedEndTime: actualEndTime,
      status: "waiting",
    };

    this.patients.push(newPatient);

    // Set current token only if this is the first patient
    if (this.patients.length === 1) {
      this.currentToken = tokenNumber;
    }

    await this.save();

    // Update the appointment with queue number
    await Appointment.findByIdAndUpdate(
      appointmentId,
      { queueNumber: tokenNumber },
      { new: true }
    );

    return {
      tokenNumber,
      estimatedStartTime: actualStartTime,
      estimatedEndTime: actualEndTime,
    };
  } catch (error) {
    // If anything fails, rollback changes
    this.patients = this.patients.filter(
      (p) => p.appointment.toString() !== appointmentId
    );
    if (this.patients.length === 0) {
      this.currentToken = 0;
      this.lastTokenNumber = 0;
    }
    await this.save();
    throw new Error(`Failed to add patient to queue: ${error.message}`);
  }
};

// Method to get next waiting token
QueueSchema.methods.getNextWaitingToken = function () {
  const waitingPatient = this.patients.find((p) => p.status === "waiting");
  return waitingPatient ? waitingPatient.tokenNumber : null;
};

// Method to validate if consultation can be started
QueueSchema.methods.canStartConsultation = function (tokenNumber) {
  const nextToken = this.getNextWaitingToken();
  return nextToken === tokenNumber;
};

// Method to start consultation
QueueSchema.methods.startConsultation = async function (appointmentId) {
  const patientIndex = this.patients.findIndex(
    (p) => p.appointment.toString() === appointmentId
  );

  if (patientIndex === -1) {
    throw new Error("Patient not found in queue");
  }

  const patient = this.patients[patientIndex];
  if (!this.canStartConsultation(patient.tokenNumber)) {
    throw new Error(
      `Cannot start consultation. Current token number is ${this.currentToken}`
    );
  }

  patient.status = "in-progress";
  patient.actualStartTime = new Date();
  this.currentToken = patient.tokenNumber;
  await this.save();

  return patient;
};

QueueSchema.methods.updateCurrentToken = async function () {
  const nextWaitingPatient = this.patients.find((p) => p.status === "waiting");
  if (nextWaitingPatient) {
    this.currentToken = nextWaitingPatient.tokenNumber;
  } else {
    // If no waiting patients, find last completed patient
    const completedPatients = this.patients.filter(
      (p) => p.status === "completed"
    );
    if (completedPatients.length > 0) {
      this.currentToken =
        completedPatients[completedPatients.length - 1].tokenNumber;
    }
  }
  await this.save();
  return this.currentToken;
};

// Method to complete consultation
QueueSchema.methods.completeConsultation = async function (appointmentId) {
  const patientIndex = this.patients.findIndex(
    (p) => p.appointment.toString() === appointmentId
  );

  if (patientIndex === -1) {
    throw new Error("Patient not found in queue");
  }

  const patient = this.patients[patientIndex];
  if (patient.status !== "in-progress") {
    throw new Error("Consultation must be in progress to complete");
  }

  const actualEndTime = new Date();
  const actualDuration = Math.floor(
    (actualEndTime - patient.actualStartTime) / (1000 * 60)
  );

  patient.status = "completed";
  patient.actualEndTime = actualEndTime;
  patient.actualDuration = actualDuration;

  // Update metrics
  this.metrics.totalPatients += 1;
  this.metrics.averageConsultationTime = Math.round(
    (this.metrics.averageConsultationTime * (this.metrics.totalPatients - 1) +
      actualDuration) /
      this.metrics.totalPatients
  );

  // Update current token to next waiting patient
  const nextWaitingToken = this.getNextWaitingToken();
  this.currentToken = nextWaitingToken || this.currentToken;

  await this.save();
  return patient;
};

// Method to update queue timing
QueueSchema.methods.updateQueueTiming = async function () {
  const currentTime = new Date();
  let lastEndTime = currentTime;

  for (const patient of this.patients) {
    if (patient.status === "waiting") {
      patient.estimatedStartTime = new Date(lastEndTime);
      patient.estimatedEndTime = new Date(
        lastEndTime.getTime() +
          (patient.estimatedEndTime - patient.estimatedStartTime)
      );
      lastEndTime = patient.estimatedEndTime;
    }
  }

  await this.save();
};

const Queue = mongoose.models.Queue || mongoose.model("Queue", QueueSchema);

export default Queue;
