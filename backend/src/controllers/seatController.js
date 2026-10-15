// Feature 4: Select Seats (FR-10..FR-12)
const { Screen, Showtime, SeatLock } = require('../models');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/ids');
const { loadShowtime } = require('./showtimeController');
const { expireHolds } = require('../services/holdService');
const { subscribe } = require('../services/seatEvents');

// GET /api/showtimes/:id/seats   (login optional - logged-in users also see which seats are theirs)
// status per seat: available | held (someone else is paying) | yours (your pending hold) | booked
async function getSeats(req, res) {
  const showtimeId = parseId(req.params.id, 'Showtime id');
  await expireHolds();

  const showtime = await loadShowtime(showtimeId);
  if (!showtime) throw new HttpError(404, 'Showtime not found');

  const [screen, locks] = await Promise.all([
    Screen.findById(showtime.screen.screen_id).select('seats').lean(),
    SeatLock.find({ showtime: showtimeId, active: true }).populate('booking', 'status user hold_expires_at').lean(),
  ]);
  const lockBySeat = new Map(locks.map((l) => [l.seat, l.booking]));

  const me = req.auth && req.auth.role === 'user' ? String(req.auth.id) : null;
  const counts = { available: 0, held: 0, yours: 0, booked: 0 };
  const rowMap = new Map();
  for (const s of screen.seats) {
    const b = lockBySeat.get(s.label);
    let status = 'available';
    if (b && b.status === 'Paid') status = 'booked';
    else if (b && b.status === 'Pending') status = String(b.user) === me ? 'yours' : 'held';
    counts[status]++;
    if (!rowMap.has(s.row)) rowMap.set(s.row, []);
    rowMap.get(s.row).push({
      seat_id: s.label, // the seat label ("A5") is the seat id
      label: s.label,
      number: s.number,
      status,
      ...(status === 'yours'
        ? { hold_seconds_left: Math.max(0, Math.floor((new Date(b.hold_expires_at).getTime() - Date.now()) / 1000)) }
        : {}),
    });
  }

  res.json({
    showtime,
    max_seats_per_booking: 6,
    summary: counts,
    rows: [...rowMap].map(([row, seats]) => ({ row, seats })),
  });
}

// GET /api/showtimes/:id/seats/stream  -> Server-Sent Events
// Events: "seats" with { seat_ids: [..], status: 'held'|'booked'|'available' }
// Frontend: const es = new EventSource(url); es.addEventListener('seats', e => ...)
async function streamSeats(req, res) {
  const showtimeId = parseId(req.params.id, 'Showtime id');
  if (!(await Showtime.exists({ _id: showtimeId }))) throw new HttpError(404, 'Showtime not found');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n'); // browser auto-reconnects after 3s
  res.write('event: ready\ndata: {}\n\n');

  const unsubscribe = subscribe(showtimeId, (evt) => {
    res.write(`event: seats\ndata: ${JSON.stringify(evt)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

module.exports = { getSeats, streamSeats };
