export const generateTimeSlots = (startTime, endTime, duration) => {
  const slots = [];
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);

  while (start < end) {
    slots.push(
      start.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
    );
    start.setMinutes(start.getMinutes() + (duration || 15));
  }

  return slots;
};
