const { SeatLock } = require('../models');

// Frees every active seat lock of the given bookings.
// Returns { showtimeId: [seat labels] } so callers can tell watchers which seats came back.
async function releaseLocks(bookingIds) {
  if (!bookingIds.length) return {};
  const locks = await SeatLock.find({ booking: { $in: bookingIds }, active: true }).select('showtime seat').lean();
  if (!locks.length) return {};
  await SeatLock.updateMany({ _id: { $in: locks.map((l) => l._id) } }, { $set: { active: false } });
  const byShow = {};
  for (const l of locks) (byShow[String(l.showtime)] = byShow[String(l.showtime)] || []).push(l.seat);
  return byShow;
}

module.exports = { releaseLocks };
