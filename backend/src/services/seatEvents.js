// In-memory pub/sub so every open seat map updates live (Server-Sent Events).
// NFR-2: seat availability reaches other users well within 2 seconds.
// Single-process only - fine for this monolith. (Multiple servers would need Redis pub/sub.)
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

// status: 'held' | 'booked' | 'available'
function publishSeats(showtimeId, seatIds, status) {
  if (!seatIds.length) return;
  bus.emit(`showtime:${showtimeId}`, { seat_ids: seatIds, status, at: Date.now() });
}

function subscribe(showtimeId, listener) {
  const channel = `showtime:${showtimeId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}

module.exports = { publishSeats, subscribe };
