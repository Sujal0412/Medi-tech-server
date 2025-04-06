import mongoose from "mongoose";
import Queue from "./queue.js";
const AppointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  department: {
    type: String,
    required: true,
    enum: [
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
    ],
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: [
      "scheduled", // Initial status when booking
      "in-progress", // During consultation
      "completed", // After consultation
      "cancelled", // If cancelled
    ],
    default: "scheduled",
  },
  timeSlot: {
    type: String,
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
  reason: {
    type: String,
    required: true,
  },
});

AppointmentSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("date") || this.isModified("status")) {
    const doctor = await mongoose.model("Doctor").findById(this.doctor);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    // Handle new appointment
    if (this.isNew) {
      const availableSlots = await doctor.generateTimeSlots(this.date);
      if (availableSlots.length === 0) {
        throw new Error("No available slots for this date");
      }

      const firstSlot = availableSlots[0];
      this.timeSlot = firstSlot.time;
      this.estimatedStartTime = firstSlot.estimatedStartTime;
      this.estimatedEndTime = firstSlot.estimatedEndTime;
    }

    // Handle status change to in-queue
    if (this.status === "in-queue") {
      try {
        // Find or create queue for the day
        let queue = await Queue.findOne({
          doctor: this.doctor,
          date: {
            $gte: new Date(this.date).setHours(0, 0, 0),
            $lt: new Date(this.date).setHours(23, 59, 59),
          },
        });

        if (!queue) {
          queue = await Queue.create({
            doctor: this.doctor,
            date: this.date,
          });
        }

        // Add to queue and update timing
        const queueDetails = await queue.addPatient(
          this._id,
          this.estimatedStartTime,
          this.estimatedEndTime
        );

        // Update appointment with queue timing
        this.estimatedStartTime = queueDetails.estimatedStartTime;
        this.estimatedEndTime = queueDetails.estimatedEndTime;

        // Update queue timings
        await queue.updateQueueTiming();
      } catch (error) {
        throw new Error(`Queue error: ${error.message}`);
      }
    }
  }
  next();
});

const Appointment = mongoose.model("Appointment", AppointmentSchema);

export default Appointment;
