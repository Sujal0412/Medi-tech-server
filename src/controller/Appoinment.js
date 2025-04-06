import Appointment from "../models/appoinment.js";
import Doctor from "../models/doctor.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import Queue from "../models/queue.js";
import Patient from "../models/patient.js";

export const createAppoinment = AsyncHandler(async (req, res, next) => {
  const { patientId, doctorId, date, reason, department } = req.body;

  const requestedDate = new Date(date);
  const startOfDay = new Date(requestedDate);
  const endOfDay = new Date(requestedDate);

  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);
  let patient;
  if (patientId) {
    patient = await Patient.findById(patientId);
  } else {
    patient = await Patient.findOne({ user: req.user._id });
  }

  if (!patient) throw new ErrorHandler("patient not found", 404);

  // Validate doctor
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new ErrorHandler("Doctor not found", 404);
  }

  const existingDayAppointment = await Appointment.findOne({
    patient: patient._id,
    doctor: doctorId,
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
    status: {
      $in: ["scheduled", "pending", "in-progress"],
    },
  });

  if (existingDayAppointment) {
    throw new ErrorHandler(
      "You already have an appointment scheduled for this day",
      400
    );
  }

  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  if (requestedDate < currentDate) {
    throw new ErrorHandler("Cannot book appointments for past dates", 400);
  }
  // Get available slots for the day
  const availableSlots = await doctor.generateTimeSlots(date);
  if (availableSlots.length === 0) {
    throw new ErrorHandler("No available slots for this date", 400);
  }

  // Get first available slot
  const firstSlot = availableSlots[0];
  const estimatedEndTime = new Date(firstSlot.estimatedStartTime);
  estimatedEndTime.setMinutes(
    estimatedEndTime.getMinutes() + doctor.consultationDuration
  );

  // Create appointment (directly scheduled)
  const appointment = await Appointment.create({
    patient: patient._id,
    doctor: doctorId,
    department,
    date: new Date(date),
    reason,
    timeSlot: firstSlot.time,
    estimatedStartTime: firstSlot.estimatedStartTime,
    estimatedEndTime: estimatedEndTime,
    status: "scheduled", // Direct scheduling
  });

  // Handle queue creation if appointment is for today
  const queue =
    (await Queue.findOne({
      doctor: doctorId,
      date: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    })) ||
    (await Queue.create({
      doctor: doctorId,
      date: requestedDate,
      currentToken: 0,
      lastTokenNumber: 0,
    }));

  // Add patient to queue
  const queueDetails = await queue.addPatient(
    appointment._id,
    firstSlot.estimatedStartTime,
    estimatedEndTime
  );

  // Update appointment with queue number
  appointment.queueNumber = queueDetails.tokenNumber;
  await appointment.save();

  // Then update consultation history
  await Patient.findByIdAndUpdate(
    patient._id,
    {
      $push: {
        consultationHistory: appointment._id,
      },
    },
    { new: true }
  );
  res.status(201).json({
    success: true,
    message: "Appointment scheduled successfully",
    appointment: {
      ...appointment.toObject(),
      estimatedStartTime: appointment.estimatedStartTime.toLocaleTimeString(),
      estimatedEndTime: appointment.estimatedEndTime.toLocaleTimeString(),
    },
  });
});

export const startConsultation = AsyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new ErrorHandler("Appointment not found", 404);
  }

  // Check if consultation is being started on the appointment date
  const today = new Date();
  const appointmentDate = new Date(appointment.date);

  if (today.toDateString() !== appointmentDate.toDateString()) {
    throw new ErrorHandler(
      "Consultation can only be started on the appointment date",
      400
    );
  }

  // Find queue for the appointment
  const queue = await Queue.findOne({
    "patients.appointment": appointmentId,
    date: {
      $gte: new Date(appointmentDate).setHours(0, 0, 0),
      $lt: new Date(appointmentDate).setHours(23, 59, 59),
    },
  });

  if (!queue) {
    throw new ErrorHandler("Queue not found", 404);
  }

  // Find patient in queue
  const patientIndex = queue.patients.findIndex(
    (p) => p.appointment.toString() === appointmentId
  );

  if (patientIndex === -1) {
    throw new ErrorHandler("Patient not found in queue", 404);
  }

  // Check if this is the current token
  const patientTokenNumber = queue.patients[patientIndex].tokenNumber;
  const nextWaitingPatient = queue.patients.find((p) => p.status === "waiting");

  if (
    !nextWaitingPatient ||
    nextWaitingPatient.tokenNumber !== patientTokenNumber
  ) {
    throw new ErrorHandler(
      `Cannot start consultation. Current token number is ${nextWaitingPatient?.tokenNumber}`,
      400
    );
  }

  // Update appointment status
  appointment.status = "in-progress";
  await appointment.save();

  // Update queue patient status
  queue.patients[patientIndex].status = "in-progress";
  queue.patients[patientIndex].actualStartTime = new Date();
  queue.currentToken = patientTokenNumber;
  await queue.save();

  res.status(200).json({
    success: true,
    message: "Consultation started",
    appointment,
    currentToken: queue.currentToken,
  });
});

export const completeConsultation = AsyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new ErrorHandler("Appointment not found", 404);
  }

  // Validate date and status
  const today = new Date();
  const appointmentDate = new Date(appointment.date);

  if (today.toDateString() !== appointmentDate.toDateString()) {
    throw new ErrorHandler(
      "Consultation can only be completed on the appointment date",
      400
    );
  }

  if (appointment.status !== "in-progress") {
    throw new ErrorHandler("Appointment must be in-progress to complete", 400);
  }

  // Update appointment status
  appointment.status = "completed";
  await appointment.save();

  try {
    // Find queue
    const queue = await Queue.findOne({
      "patients.appointment": appointmentId,
      date: {
        $gte: new Date(appointmentDate).setHours(0, 0, 0),
        $lt: new Date(appointmentDate).setHours(23, 59, 59),
      },
    });

    if (queue) {
      // Use the queue method to complete consultation
      const completedPatient = await queue.completeConsultation(appointmentId);

      // Find next patient for the response
      const waitingPatients = queue.patients
        .filter((p) => p.status === "waiting")
        .sort((a, b) => a.tokenNumber - b.tokenNumber);

      const nextPatient =
        waitingPatients.length > 0 ? waitingPatients[0] : null;

      return res.status(200).json({
        success: true,
        message: "Consultation completed successfully",
        appointment,
        metrics: queue.metrics,
        completedPatient: {
          tokenNumber: completedPatient.tokenNumber,
          actualStartTime:
            completedPatient.actualStartTime.toLocaleTimeString(),
          actualEndTime: completedPatient.actualEndTime.toLocaleTimeString(),
          actualDuration: completedPatient.actualDuration,
        },
        nextPatient: nextPatient
          ? {
              tokenNumber: nextPatient.tokenNumber,
              estimatedStartTime:
                nextPatient.estimatedStartTime.toLocaleTimeString(),
              estimatedEndTime:
                nextPatient.estimatedEndTime.toLocaleTimeString(),
            }
          : null,
        currentToken: queue.currentToken,
        lastTokenNumber: queue.lastTokenNumber,
      });
    }

    // If no queue found
    return res.status(200).json({
      success: true,
      message: "Consultation completed successfully",
      appointment,
    });
  } catch (error) {
    // Revert appointment status if anything fails
    appointment.status = "in-progress";
    await appointment.save();
    throw new ErrorHandler(
      `Failed to complete consultation: ${error.message}`,
      500
    );
  }
});
export const getPendingAppointments = AsyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  const pendingAppointments = await Appointment.find({
    doctor: doctorId,
    status: "pending",
  }).populate("patient", "name email"); // Populate patient details

  res.status(200).json({
    success: true,
    pendingAppointments,
  });
});

export const getAllAppoinmentOfDoctor = AsyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  const appointments = await Appointment.find({
    doctor: doctorId,
  }).populate("patient", "name email");
});

export const getPatientAppointments = AsyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const patient = await Patient.findOne({ user: req.user._id });
  if (!patient) throw new ErrorHandler("Patient not found", 404);
  // Get all upcoming or today's appointments
  const appointments = await Appointment.find({
    patient: patient._id,
    date: { $gte: today },
    status: { $in: ["scheduled", "in-progress"] },
  })
    .populate({
      path: "doctor",
      select: "firstName lastName specialization consultationDuration",
    })
    .sort({ date: 1, estimatedStartTime: 1 })
    .lean();

  const appointmentsWithQueue = await Promise.all(
    appointments.map(async (apt) => {
      const appointmentDate = new Date(apt.date);
      const startOfDay = new Date(appointmentDate);
      const endOfDay = new Date(appointmentDate);

      startOfDay.setHours(0, 0, 0, 0);
      endOfDay.setHours(23, 59, 59, 999);

      const queue = await Queue.findOne({
        doctor: apt.doctor._id,
        date: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      });

      const baseAppointment = {
        _id: apt._id,
        date: apt.date,
        reason: apt.reason,
        department: apt.department,
        status: apt.status,
        appointmentTime: new Date(apt.estimatedStartTime).toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }
        ),
        doctor: {
          name: `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}`,
          specialization: apt.doctor.specialization,
          consultationDuration: apt.doctor.consultationDuration,
        },
      };

      if (!queue) {
        return {
          ...baseAppointment,
          queueInfo: null,
        };
      }

      const queuePatient = queue.patients.find(
        (p) => p.appointment.toString() === apt._id.toString()
      );

      if (!queuePatient) {
        return {
          ...baseAppointment,
          queueInfo: null,
        };
      }

      // Calculate patients ahead and waiting time
      const patientsAhead = queue.patients.filter(
        (p) =>
          (p.status === "waiting" || p.status === "in-progress") &&
          p.tokenNumber < queuePatient.tokenNumber
      ).length;

      // Calculate estimated wait time based on doctor's consultation duration
      const estimatedWaitTimeMinutes =
        patientsAhead * apt.doctor.consultationDuration;

      // Format waiting time
      const waitingTime =
        estimatedWaitTimeMinutes > 60
          ? `${Math.floor(estimatedWaitTimeMinutes / 60)} hr ${
              estimatedWaitTimeMinutes % 60
            } min`
          : `${estimatedWaitTimeMinutes} min`;

      // Calculate estimated start time
      const estimatedStartTime = new Date();
      estimatedStartTime.setMinutes(
        estimatedStartTime.getMinutes() + estimatedWaitTimeMinutes
      );

      return {
        ...baseAppointment,
        queueInfo: {
          tokenNumber: queuePatient.tokenNumber,
          currentToken: queue.currentToken,
          totalPatientsInQueue: queue.patients.filter(
            (p) => p.status === "waiting" || p.status === "in-progress"
          ).length,
          patientsAhead,
          estimatedWaitTime: waitingTime,
          estimatedStartTime: estimatedStartTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          isMyTurn: queue.currentToken === queuePatient.tokenNumber,
        },
      };
    })
  );

  res.status(200).json({
    success: true,
    count: appointmentsWithQueue.length,
    appointments: appointmentsWithQueue,
  });
});

export const getAppoinemtDataForPatient = AsyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  // Get appointment with populated doctor and patient details
  const appointment = await Appointment.findById(appointmentId)
    .populate({
      path: "doctor",
      select:
        "firstName lastName specialization consultationDuration consultationMetrics",
    })
    .populate({
      path: "patient",
      populate: {
        path: "user",
        select: "name",
      },
    })
    .lean();

  if (!appointment) {
    throw new ErrorHandler("Appointment not found", 404);
  }

  // Get queue information
  const appointmentDate = new Date(appointment.date);
  const startOfDay = new Date(appointmentDate);
  const endOfDay = new Date(appointmentDate);

  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  const queue = await Queue.findOne({
    doctor: appointment.doctor._id,
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
  });

  // Base appointment data without queue info
  const baseAppointmentData = {
    _id: appointment._id,
    patientName: appointment.patient?.user?.name || "Unknown Patient", // Updated to safely access name
    date: appointment.date,
    reason: appointment.reason,
    department: appointment.department,
    status: appointment.status,
    appointmentTime: appointment.estimatedStartTime
      ? new Date(appointment.estimatedStartTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : null,
    doctor: {
      name: `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
      specialization: appointment.doctor.specialization,
      consultationDuration: appointment.doctor.consultationDuration,
      metrics: appointment.doctor.consultationMetrics || {},
    },
  };

  // If no queue exists, return base appointment data
  if (!queue) {
    return res.status(200).json({
      success: true,
      appointment: {
        ...baseAppointmentData,
        queueInfo: null,
      },
    });
  }

  // Find patient in queue
  const queuePatient = queue.patients.find(
    (p) => p.appointment.toString() === appointmentId
  );

  // If patient not in queue, return base appointment data
  if (!queuePatient) {
    return res.status(200).json({
      success: true,
      appointment: {
        ...baseAppointmentData,
        queueInfo: null,
      },
    });
  }

  // Calculate queue statistics
  const waitingPatients = queue.patients.filter(
    (p) => p.status === "waiting" || p.status === "in-progress"
  );

  const completedPatients = queue.patients.filter(
    (p) => p.status === "completed"
  );

  const patientsAhead = waitingPatients.filter(
    (p) => p.tokenNumber < queuePatient.tokenNumber
  ).length;

  // Calculate wait time
  const estimatedWaitTimeMinutes =
    patientsAhead * appointment.doctor.consultationDuration;
  const waitingTime =
    estimatedWaitTimeMinutes > 60
      ? `${Math.floor(estimatedWaitTimeMinutes / 60)} hr ${
          estimatedWaitTimeMinutes % 60
        } min`
      : `${estimatedWaitTimeMinutes} min`;

  // Calculate average consultation time
  const averageConsultationTime =
    completedPatients.length > 0
      ? Math.round(
          completedPatients.reduce(
            (sum, p) => sum + (p.actualDuration || 0),
            0
          ) / completedPatients.length
        )
      : appointment.doctor.consultationDuration;

  // Prepare queue information with safe access
  const queueInfo = {
    tokenNumber: queuePatient.tokenNumber,
    currentToken: queue.currentToken,
    status: queuePatient.status,
    estimatedStartTime: queuePatient.estimatedStartTime
      ? queuePatient.estimatedStartTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : null,
    totalPatientsInQueue: waitingPatients.length,
    patientsAhead,
    completedPatients: completedPatients.length,
    waitingTime,
    averageConsultationTime,
    isMyTurn: queue.currentToken === queuePatient.tokenNumber,
    queueMetrics: queue.metrics
      ? {
          averageWaitTime: queue.metrics.averageWaitTime || 0,
          averageConsultationTime: queue.metrics.averageConsultationTime || 0,
          totalPatientsServed: queue.metrics.totalPatients || 0,
        }
      : null,
  };

  // Return final response
  res.status(200).json({
    success: true,
    appointment: {
      ...baseAppointmentData,
      queueInfo,
    },
  });
});

export const getMedicalHistory = AsyncHandler(async (req, res) => {
  const patientId = req.user._id;

  // Find patient and populate consultation history with appointments and queue info
  const patient = await Patient.findOne({ user: patientId }).populate({
    path: "consultationHistory",
    populate: [
      {
        path: "doctor",
        select: "firstName lastName specialization",
      },
    ],
    options: { sort: { date: -1 } },
  });

  // Get all queue data for completed appointments
  const queueData = await Queue.find({
    "patients.appointment": {
      $in: patient.consultationHistory.map((apt) => apt._id),
    },
  });

  const records = await Promise.all(
    patient.consultationHistory.map(async (appointment) => {
      // Find queue info for this appointment
      const queueInfo = queueData.find((q) =>
        q.patients.some(
          (p) => p.appointment.toString() === appointment._id.toString()
        )
      );

      const patientQueueData = queueInfo?.patients.find(
        (p) => p.appointment.toString() === appointment._id.toString()
      );

      return {
        _id: appointment._id,
        type: "consultations",
        title: `Consultation with Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        doctor: `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        specialization: appointment.doctor.specialization,
        date: appointment.date,
        department: appointment.department,
        reason: appointment.reason,
        status: appointment.status,
        // For scheduled appointments
        scheduledTime: new Date(
          appointment.estimatedStartTime
        ).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        // For completed appointments
        consultationDetails:
          appointment.status === "completed" && patientQueueData
            ? {
                tokenNumber: patientQueueData.tokenNumber,
                actualStartTime:
                  patientQueueData.actualStartTime?.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  }),
                actualEndTime:
                  patientQueueData.actualEndTime?.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  }),
                duration: patientQueueData.actualDuration
                  ? `${patientQueueData.actualDuration} mins`
                  : null,
              }
            : null,
      };
    })
  );

  res.status(200).json({
    success: true,
    records,
  });
});

export const getAllAppoinmentsDoctor = AsyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.query;

  // Set default date to today if not provided
  const requestedDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(requestedDate);
  const endOfDay = new Date(requestedDate);

  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  // Get appointments with proper population
  const appointments = await Appointment.find({
    doctor: doctorId,
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
  })
    .populate([
      {
        path: "patient",
        populate: {
          path: "user",
          model: "User",
          select: "name email",
        },
      },
      {
        path: "doctor",
        select: "firstName lastName specialization consultationDuration",
      },
    ])
    .sort({ estimatedStartTime: 1 })
    .lean();

  // Get queue information for the day
  const queue = await Queue.findOne({
    doctor: doctorId,
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
  });

  // Process appointments with improved error handling and data validation
  const processedAppointments = appointments.map((apt) => {
    const queuePatient = queue?.patients.find(
      (p) => p.appointment.toString() === apt._id.toString()
    );

    // Validate and extract patient data
    const baseAppointment = {
      _id: apt._id,
      patient: {
        name: apt.patient?.user?.name || "Unknown Patient",
        email: apt.patient?.user?.email || "No email provided",
        patientId: apt.patient?.patientIdentifier,
        userId: apt.patient?.user?._id,
      },
      doctor: {
        name: `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`,
        specialization: apt.doctor?.specialization,
        consultationDuration: apt.doctor?.consultationDuration,
      },
      date: apt.date,
      status: apt.status,
      reason: apt.reason,
      department: apt.department,
      scheduledTime: new Date(apt.estimatedStartTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    };

    // Add queue information if available
    if (queuePatient) {
      return {
        ...baseAppointment,
        queueInfo: {
          tokenNumber: queuePatient.tokenNumber,
          status: queuePatient.status,
          isCurrentPatient: queue.currentToken === queuePatient.tokenNumber,
          estimatedStartTime:
            queuePatient.estimatedStartTime?.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
          actualStartTime: queuePatient.actualStartTime?.toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }
          ),
          actualEndTime: queuePatient.actualEndTime?.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          duration: queuePatient.actualDuration
            ? `${queuePatient.actualDuration} mins`
            : null,
        },
      };
    }

    return baseAppointment;
  });

  // Group appointments by status
  const groupedAppointments = {
    scheduled: processedAppointments.filter(
      (apt) => apt.status === "scheduled"
    ),
    inProgress: processedAppointments.filter(
      (apt) => apt.status === "in-progress"
    ),
    completed: processedAppointments.filter(
      (apt) => apt.status === "completed"
    ),
    cancelled: processedAppointments.filter(
      (apt) => apt.status === "cancelled"
    ),
  };

  // Calculate queue stats
  const queueStats = queue
    ? {
        currentToken: queue.currentToken,
        totalAppointments: queue.patients.length,
        waitingCount: queue.patients.filter((p) => p.status === "waiting")
          .length,
        inProgressCount: queue.patients.filter(
          (p) => p.status === "in-progress"
        ).length,
        completedCount: queue.patients.filter((p) => p.status === "completed")
          .length,
        averageConsultationTime: queue.metrics?.averageConsultationTime || 0,
      }
    : null;

  res.status(200).json({
    success: true,
    date: requestedDate,
    queueStats,
    appointmentCounts: {
      total: processedAppointments.length,
      scheduled: groupedAppointments.scheduled.length,
      inProgress: groupedAppointments.inProgress.length,
      completed: groupedAppointments.completed.length,
      cancelled: groupedAppointments.cancelled.length,
    },
    appointments: groupedAppointments,
  });
});

export const getQueue = AsyncHandler(async (req, res) => {
  const { queueId } = req.params;

  const queue = await Queue.findById(queueId)
    .populate({
      path: "doctor",
      select: "firstName lastName specialization consultationDuration",
    })
    .lean();

  if (!queue) {
    throw new ErrorHandler("Queue not found", 404);
  }

  const appointmentIds = queue.patients.map((p) => p.appointment);

  const appointments = await Appointment.find({
    _id: { $in: appointmentIds },
  })
    .populate({
      path: "patient",
      populate: {
        path: "user",
        select: "name email",
      },
    })
    .lean();

  const formatTime = (time) => {
    if (!time) return null;
    return new Date(time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const patientsWithDetails = queue.patients.map((queuePatient) => {
    const appointment = appointments.find(
      (apt) => apt._id.toString() === queuePatient.appointment.toString()
    );

    return {
      _id: queuePatient.appointment,
      tokenNumber: queuePatient.tokenNumber,
      status: queuePatient.status,
      estimatedStartTime: formatTime(queuePatient.estimatedStartTime),
      estimatedEndTime: formatTime(queuePatient.estimatedEndTime),
      actualStartTime: formatTime(queuePatient.actualStartTime),
      actualEndTime: formatTime(queuePatient.actualEndTime),
      actualDuration: queuePatient.actualDuration
        ? `${queuePatient.actualDuration} mins`
        : null,
      isCurrentPatient: queue.currentToken === queuePatient.tokenNumber,
      patientInfo: appointment
        ? {
            id: appointment.patient?._id,
            name: appointment.patient?.user?.name || "Unknown Patient",
            email: appointment.patient?.user?.email || "No email provided",
            contactNumber:
              appointment.patient?.contactNumber || "Not available",
            reason: appointment.reason,
            department: appointment.department,
            scheduledTime: formatTime(appointment.estimatedStartTime),
          }
        : null,
    };
  });

  const waitingPatients = patientsWithDetails.filter(
    (p) => p.status === "waiting"
  ).length;
  const inProgressPatients = patientsWithDetails.filter(
    (p) => p.status === "in-progress"
  ).length;

  const completedPatients = patientsWithDetails.filter(
    (p) => p.status === "completed"
  ).length;

  const queueData = {
    _id: queue._id,
    date: queue.date,
    doctor: {
      id: queue.doctor._id,
      name: `Dr. ${queue.doctor.firstName} ${queue.doctor.lastName}`,
      specialization: queue.doctor.specialization,
      consultationDuration: queue.doctor.consultationDuration,
    },
    currentToken: queue.currentToken,
    stats: {
      totalPatients: queue.patients.length,
      waitingPatients,
      inProgressPatients,
      completedPatients,
      averageConsultationTime: queue.metrics?.averageConsultationTime || 0,
    },
    patients: patientsWithDetails.sort((a, b) => a.tokenNumber - b.tokenNumber),
  };

  res.status(200).json({
    success: true,
    queue: queueData,
  });
});

export const getTodayQueues = AsyncHandler(async (req, res) => {
  const { department } = req.query;

  // Set up date range for today
  const today = new Date();
  const startOfDay = new Date(today);
  const endOfDay = new Date(today);

  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  // Prepare query for queues
  const query = {
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
  };

  // If department is specified, fetch doctors in that department first
  if (department) {
    const doctors = await Doctor.find({ specialization: department }).select(
      "_id"
    );
    const doctorIds = doctors.map((doc) => doc._id);
    query.doctor = { $in: doctorIds };
  }

  // Find all queues for today with minimal data
  const queues = await Queue.find(query)
    .populate({
      path: "doctor",
      select: "firstName lastName specialization consultationDuration",
    })
    .lean();

  // Create a more efficient summary of each queue
  const queueSummaries = await Promise.all(
    queues.map(async (queue) => {
      // Get quick counts for this queue by status
      const waitingCount = queue.patients.filter(
        (p) => p.status === "waiting"
      ).length;
      const inProgressCount = queue.patients.filter(
        (p) => p.status === "in-progress"
      ).length;
      const completedCount = queue.patients.filter(
        (p) => p.status === "completed"
      ).length;

      // Get current patient details if available
      const currentPatient = queue.patients.find(
        (p) => p.tokenNumber === queue.currentToken
      );
      let currentAppointmentInfo = null;

      if (currentPatient) {
        const appointment = await Appointment.findById(
          currentPatient.appointment
        )
          .populate({
            path: "patient",
            populate: {
              path: "user",
              select: "name email",
            },
          })
          .lean();

        if (appointment) {
          currentAppointmentInfo = {
            patientName: appointment.patient?.user?.name || "Unknown Patient",
            reason: appointment.reason,
            tokenNumber: currentPatient.tokenNumber,
            startTime: currentPatient.actualStartTime
              ? new Date(currentPatient.actualStartTime).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  }
                )
              : null,
          };
        }
      }

      return {
        _id: queue._id,
        doctor: {
          id: queue.doctor._id,
          name: `Dr. ${queue.doctor.firstName} ${queue.doctor.lastName}`,
          specialization: queue.doctor.specialization,
        },
        currentToken: queue.currentToken,
        totalPatients: queue.patients.length,
        waitingCount,
        inProgressCount,
        completedCount,
        lastUpdated: queue.updatedAt,
        currentPatient: currentAppointmentInfo,
      };
    })
  );

  // Calculate department stats
  const departmentStats = {};
  queueSummaries.forEach((queue) => {
    const dept = queue.doctor.specialization;
    if (!departmentStats[dept]) {
      departmentStats[dept] = {
        totalPatients: 0,
        waitingCount: 0,
        inProgressCount: 0,
        completedCount: 0,
        doctorCount: 0,
      };
    }
    departmentStats[dept].totalPatients += queue.totalPatients;
    departmentStats[dept].waitingCount += queue.waitingCount;
    departmentStats[dept].inProgressCount += queue.inProgressCount;
    departmentStats[dept].completedCount += queue.completedCount;
    departmentStats[dept].doctorCount += 1;
  });

  // Calculate overall stats
  const overallStats = {
    totalQueues: queueSummaries.length,
    totalPatients: queueSummaries.reduce((sum, q) => sum + q.totalPatients, 0),
    waitingPatients: queueSummaries.reduce((sum, q) => sum + q.waitingCount, 0),
    inProgressPatients: queueSummaries.reduce(
      (sum, q) => sum + q.inProgressCount,
      0
    ),
    completedPatients: queueSummaries.reduce(
      (sum, q) => sum + q.completedCount,
      0
    ),
  };

  res.status(200).json({
    success: true,
    date: today,
    stats: overallStats,
    departmentStats,
    queues: queueSummaries,
  });
});

// Add this function to your existing controller file
// @desc    Create appointment for a patient by receptionist
// @route   POST /api/appointment/create-for-patient
// @access  Private (Admin, Receptionist)
export const createAppointmentForPatient = AsyncHandler(async (req, res) => {
  const { patientId, doctorId, department, date, reason } = req.body;

  // Validate required fields
  if (!patientId || !doctorId || !department || !date || !reason) {
    throw new ErrorHandler("All fields are required", 400);
  }

  // Find patient
  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new ErrorHandler("Patient not found", 404);
  }

  // Find doctor
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new ErrorHandler("Doctor not found", 404);
  }

  // Validate department matches doctor's specialization
  if (doctor.specialization !== department) {
    throw new ErrorHandler(
      "Department does not match doctor's specialization",
      400
    );
  }

  // Set up time range for checking appointments
  const requestedDate = new Date(date);
  const startOfDay = new Date(requestedDate);
  const endOfDay = new Date(requestedDate);

  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  // Check if patient already has appointment for the same day with same doctor
  const existingAppointment = await Appointment.findOne({
    patient: patientId,
    doctor: doctorId,
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
    status: { $in: ["scheduled", "in-progress"] },
  });

  if (existingAppointment) {
    throw new ErrorHandler(
      "Patient already has an appointment with this doctor for the selected date",
      400
    );
  }

  // Get available time slots from doctor
  const availableSlots = await doctor.generateTimeSlots(date);

  if (!availableSlots || availableSlots.length === 0) {
    throw new ErrorHandler("No available slots for this date", 400);
  }

  // Use first available slot
  const firstSlot = availableSlots[0];

  // Create appointment
  const appointment = await Appointment.create({
    patient: patientId,
    doctor: doctorId,
    department,
    date: requestedDate,
    timeSlot: firstSlot.time,
    estimatedStartTime: firstSlot.estimatedStartTime,
    estimatedEndTime: firstSlot.estimatedEndTime,
    reason,
    status: "scheduled",
  });

  // Add appointment to the patient's consultation history
  await Patient.findByIdAndUpdate(patientId, {
    $push: { consultationHistory: appointment._id },
  });

  // If appointment is for today, add it to the queue
  const today = new Date();
  if (
    requestedDate.getDate() === today.getDate() &&
    requestedDate.getMonth() === today.getMonth() &&
    requestedDate.getFullYear() === today.getFullYear()
  ) {
    try {
      // Find or create queue for today
      let queue = await Queue.findOne({
        doctor: doctorId,
        date: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      });

      if (!queue) {
        queue = await Queue.create({
          doctor: doctorId,
          date: requestedDate,
          currentToken: 0,
          lastTokenNumber: 0,
        });
      }

      // Add patient to queue
      const queueDetails = await queue.addPatient(
        appointment._id,
        firstSlot.estimatedStartTime,
        firstSlot.estimatedEndTime
      );

      // Update appointment with queue information
      appointment.queueNumber = queueDetails.tokenNumber;
      await appointment.save();
    } catch (error) {
      console.error("Queue error:", error);
      // Don't fail the appointment creation if queue fails
      // Just log the error and continue
    }
  }

  // Get formatted response
  res.status(201).json({
    success: true,
    message: "Appointment created successfully",
    appointment: {
      _id: appointment._id,
      date: appointment.date,
      scheduledTime: new Date(
        appointment.estimatedStartTime
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      doctor: {
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
      },
      department: department,
      reason: reason,
      status: appointment.status,
      queueNumber: appointment.queueNumber || "Not assigned",
    },
  });
});
