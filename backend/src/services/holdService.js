// Releases seats of Pending bookings whose hold has run out.
const { Booking } = require('../models');
const { releaseLocks } = require('./seatLocks');
const { publishSeats } = require('./seatEvents');

async function expireHolds() {
  const now = new Date();
  const stale = await Booking.find({ status: 'Pending', hold_expires_at: { $lt: now } }).select('_id').lean();
  if (!stale.length) return 0;
  const ids = stale.map((b) => b._id);

  // The status condition is repeated so a booking paid a split second ago is never expired.
  await Booking.updateMany(
    { _id: { $in: ids }, status: 'Pending', hold_expires_at: { $lt: now } },
    { $set: { status: 'Expired' } }
  );
  const expired = await Booking.find({ _id: { $in: ids }, status: 'Expired' }).select('_id').lean();
  const released = await releaseLocks(expired.map((b) => b._id));
  for (const [showtimeId, seats] of Object.entries(released)) publishSeats(showtimeId, seats, 'available');
  return expired.length;
}

// Background sweep so other users see seats come back even if nobody hits the API.
function startHoldSweeper(intervalMs = 15000) {
  const timer = setInterval(() => expireHolds().catch((e) => console.error('Hold sweep failed:', e.message)), intervalMs);
  timer.unref();
  return timer;
}

module.exports = { expireHolds, startHoldSweeper };
