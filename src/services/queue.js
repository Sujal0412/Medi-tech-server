import Queue from "../models/queue.js";
import Appointment from "../models/appointment.js";

export const manageQueue = AsyncHandler(async (doctorId, date) => {
  let queue = await Queue.findOne({
    doctor: doctorId,
    date: {
      $gte: new Date(date).setHours(0, 0, 0, 0),
      $lt: new Date(date).setHours(23, 59, 59, 999),
    },
    isActive: true,
  });

  if (!queue) {
    queue = await Queue.create({
      doctor: doctorId,
      date: new Date(date),
      currentToken: 0,
    });
  }

  return queue;
});

export const addToQueue = AsyncHandler(async (appointmentId, priority = 3) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new ErrorHandler("Appointment not found", 404);
  }

  const queue = await manageQueue(appointment.doctor, appointment.date);
  const tokenNumber = queue.currentToken + 1;

  // Calculate wait time
  const waitingPatients = queue.patients.filter(
    (p) => p.status === "waiting"
  ).length;
  const estimatedWaitTime = waitingPatients * queue.metrics.averageServiceTime;

  queue.patients.push({
    appointment: appointmentId,
    priority,
    tokenNumber,
    estimatedWaitTime,
  });

  queue.currentToken = tokenNumber;
  await queue.save();

  return { tokenNumber, estimatedWaitTime };
});
