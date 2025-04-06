import mongoose from "mongoose";

const DoctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },
  specialization: {
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
    default: "general",
  },
  qualification: { type: String, default: "" },
  experience: { type: Number, default: 0 },
  contactNumber: { type: String, default: "" },
  availability: [
    {
      day: {
        type: String,
        enum: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      },
      startTime: { type: String, default: Date.now },
      endTime: { type: String, default: Date.now },
    },
  ],
  consultationMetrics: {
    totalConsultations: {
      type: Number,
      default: 0,
    },
    averageConsultationTime: {
      type: Number, // in minutes
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  consultationDuration: {
    type: Number,
    default: 15, // minutes
  },
  maxPatientsPerDay: {
    type: Number,
    default: 20,
  },
});

DoctorSchema.methods.updateConsultationMetrics = async function (
  consultationDuration
) {
  this.consultationMetrics.totalConsultations += 1;
  this.consultationMetrics.averageConsultationTime = Math.round(
    (this.consultationMetrics.averageConsultationTime *
      (this.consultationMetrics.totalConsultations - 1) +
      consultationDuration) /
      this.consultationMetrics.totalConsultations
  );
  this.consultationMetrics.lastUpdated = new Date();
  await this.save();
};

DoctorSchema.methods.generateTimeSlots = async function (date) {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayOfWeek = days[new Date(date).getDay()];
  const daySchedule = this.availability.find((a) => a.day === dayOfWeek);

  if (!daySchedule || !daySchedule.startTime || !daySchedule.endTime) {
    return [];
  }

  const slots = [];
  const [startHour, startMinute] = daySchedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = daySchedule.endTime.split(":").map(Number);

  const startTime = new Date(date);
  startTime.setHours(startHour, startMinute, 0);

  const endTime = new Date(date);
  endTime.setHours(endHour, endMinute, 0);

  // Get current time
  const currentTime = new Date();
  const isToday = currentTime.toDateString() === new Date(date).toDateString();

  // If booking for today, start from next available slot after current time
  let slotStartTime = new Date(startTime);
  if (isToday) {
    slotStartTime = new Date(
      Math.max(currentTime.getTime(), startTime.getTime())
    );
    // Round up to next slot
    const minutes = slotStartTime.getMinutes();
    const roundedMinutes =
      Math.ceil(minutes / this.consultationDuration) *
      this.consultationDuration;
    slotStartTime.setMinutes(roundedMinutes, 0, 0);
  }

  // Get existing appointments for the day
  const existingAppointments = await mongoose.model("Appointment").find({
    doctor: this._id,
    date: {
      $gte: new Date(date).setHours(0, 0, 0),
      $lt: new Date(date).setHours(23, 59, 59),
    },
    status: { $nin: ["cancelled", "completed"] },
  });

  let currentSlotTime = new Date(slotStartTime);
  let appointmentCount = 0;

  while (
    currentSlotTime < endTime &&
    appointmentCount < this.maxPatientsPerDay
  ) {
    const timeSlot = currentSlotTime.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });

    const isBooked = existingAppointments.some(
      (apt) => apt.timeSlot === timeSlot
    );

    if (!isBooked) {
      slots.push({
        time: timeSlot,
        estimatedStartTime: new Date(currentSlotTime),
        estimatedEndTime: new Date(
          currentSlotTime.getTime() + this.consultationDuration * 60000
        ),
      });
      appointmentCount++;
    }

    // Increment by consultation duration
    currentSlotTime.setMinutes(
      currentSlotTime.getMinutes() + this.consultationDuration
    );
  }

  return slots;
};

const Doctor = mongoose.model("Doctor", DoctorSchema);

export default Doctor;
