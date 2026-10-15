// Feature 5 Book Ticket, Feature 6 Mock Payment, Feature 7 History / E-Ticket (FR-13..FR-20)
// + Feature 11 View All Bookings (FR-30, FR-31)
//
// No transactions: every step is a single atomic MongoDB operation.
//  - Seats are locked by inserting SeatLock documents. The unique index (showtime + seat, active only)
//    makes the database refuse a second lock, which is what prevents double-booking (BR-1).
//  - Pay / cancel / expire use findOneAndUpdate with the expected status in the filter, so two
//    competing requests can never both succeed.
const crypto = require('crypto');
const { Booking, Showtime, Screen, SeatLock, User } = require('../models');
const { HttpError } = require('../utils/httpError');
const { getPagination } = require('../utils/pagination');
const { parseId, escapeRegex, isDuplicateKey } = require('../utils/ids');
const { isValidDate, addMinutes, nowLocal } = require('../utils/time');
const { expireHolds } = require('../services/holdService');
const { releaseLocks } = require('../services/seatLocks');
const { publishSeats } = require('../services/seatEvents');
const { listBookings, getBooking } = require('../services/bookingQueries');

const HOLD_MINUTES = Number(process.env.HOLD_MINUTES) || 5;
const MAX_SEATS = 6;
const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'wallet'];
const STATUSES = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const makeRef = () => 'DL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
const makeTxn = () => 'TXN' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();

// POST /api/bookings  { showtime_id, seat_ids: ["A5","A6"] }
// Seats are HELD for HOLD_MINUTES (status Pending) until paid.
async function createBooking(req, res) {
  const showtimeId = parseId(req.body.showtime_id, 'showtime_id');
  const raw = req.body.seat_ids;
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'Select at least one seat');
  const seats = [...new Set(raw.map((s) => String(s).trim().toUpperCase()))];
  if (seats.some((s) => !/^[A-Z]\d{1,2}$/.test(s))) throw new HttpError(400, 'seat_ids must look like "A5"');
  if (seats.length > MAX_SEATS) throw new HttpError(400, `You can book at most ${MAX_SEATS} seats at a time`);
  // always lock in the same order, so two people racing for overlapping seats cannot block each other
  seats.sort();

  await expireHolds();

  const st = await Showtime.findById(showtimeId).lean();
  if (!st) throw new HttpError(404, 'Showtime not found');
  if (!(st.start_at > nowLocal())) throw new HttpError(400, 'This show has already started');

  const screen = await Screen.findById(st.screen).select('seats').lean();
  const valid = new Set(screen.seats.map((s) => s.label));
  if (seats.some((s) => !valid.has(s))) throw new HttpError(400, 'One or more seats do not belong to this showtime');

  // a user re-picking seats replaces their previous unpaid selection instead of blocking themselves
  let freedByUs = [];
  const mine = await Booking.find({ user: req.auth.id, showtime: showtimeId, status: 'Pending' }).select('_id').lean();
  if (mine.length) {
    const mineIds = mine.map((b) => b._id);
    await Booking.updateMany({ _id: { $in: mineIds }, status: 'Pending' }, { $set: { status: 'Cancelled', hold_expires_at: null } });
    freedByUs = (await releaseLocks(mineIds))[showtimeId] || [];
  }

  const booking = await Booking.create({
    booking_ref: makeRef(),
    user: req.auth.id,
    showtime: showtimeId,
    seats,
    status: 'Pending',
    total_amount: Math.round(Number(st.price) * seats.length * 100) / 100,
    hold_expires_at: addMinutes(new Date(), HOLD_MINUTES),
  });

  try {
    await SeatLock.insertMany(
      seats.map((seat) => ({ showtime: showtimeId, seat, booking: booking._id, active: true })),
      { ordered: true }
    );
  } catch (err) {
    // undo our partial work, then report which seats were taken
    await SeatLock.deleteMany({ booking: booking._id });
    await Booking.deleteOne({ _id: booking._id });
    if (isDuplicateKey(err)) {
      const taken = await SeatLock.find({ showtime: showtimeId, seat: { $in: seats }, active: true }).distinct('seat');
      throw new HttpError(409, 'Some seats were just taken. Please pick different seats.', { unavailable_seat_ids: taken });
    }
    throw err;
  }

  // live updates for everyone else watching this seat map
  publishSeats(showtimeId, freedByUs.filter((s) => !seats.includes(s)), 'available');
  publishSeats(showtimeId, seats, 'held');

  const { booking: shaped } = await getBooking(booking._id);
  res.status(201).json({ booking: shaped, hold_minutes: HOLD_MINUTES });
}

// POST /api/bookings/:id/pay  { method }   (mock - no gateway)
async function payBooking(req, res) {
  const id = parseId(req.params.id, 'Booking id');
  const method = String(req.body.method || '').toLowerCase();
  if (!PAYMENT_METHODS.includes(method)) throw new HttpError(400, `method must be one of: ${PAYMENT_METHODS.join(', ')}`);

  // quick ownership/state check first so wrong requests fail fast without the artificial delay
  const pre = await Booking.findOne({ _id: id, user: req.auth.id }).select('status total_amount').lean();
  if (!pre) throw new HttpError(404, 'Booking not found');
  if (pre.status === 'Paid') throw new HttpError(409, 'This booking is already paid');

  // gives the frontend time to play its "processing" animation
  await sleep(Number(process.env.MOCK_PAYMENT_DELAY_MS ?? 1200));

  const now = new Date();
  // One atomic step: only a Pending booking whose hold has not run out can become Paid
  const paid = await Booking.findOneAndUpdate(
    { _id: id, user: req.auth.id, status: 'Pending', hold_expires_at: { $gt: now } },
    { $set: { status: 'Paid', hold_expires_at: null, payment: { method, status: 'Success', amount: pre.total_amount, transaction_ref: makeTxn(), paid_at: now } } },
    { new: true }
  ).lean();

  if (!paid) {
    const cur = await Booking.findOne({ _id: id, user: req.auth.id }).select('status').lean();
    if (cur && cur.status === 'Paid') throw new HttpError(409, 'This booking is already paid');
    throw new HttpError(410, 'Your seat hold expired. Please select seats again.');
  }

  publishSeats(String(paid.showtime), paid.seats, 'booked');
  const { booking } = await getBooking(id);
  res.json({ message: 'Payment successful', booking });
}

// POST /api/bookings/:id/cancel  - only unpaid (Pending) bookings
async function cancelBooking(req, res) {
  const id = parseId(req.params.id, 'Booking id');
  const b = await Booking.findOneAndUpdate(
    { _id: id, user: req.auth.id, status: 'Pending' },
    { $set: { status: 'Cancelled', hold_expires_at: null } },
    { new: true }
  ).lean();

  if (!b) {
    const cur = await Booking.findOne({ _id: id, user: req.auth.id }).select('status').lean();
    if (!cur) throw new HttpError(404, 'Booking not found');
    throw new HttpError(409, `A ${cur.status.toLowerCase()} booking cannot be cancelled`);
  }
  const freed = await releaseLocks([b._id]);
  for (const [showtimeId, seats] of Object.entries(freed)) publishSeats(showtimeId, seats, 'available');
  const { booking } = await getBooking(id);
  res.json({ message: 'Booking cancelled', booking });
}

// GET /api/bookings/my?status=Paid&page=1&limit=10   (BR-4: users see only their own)
async function myBookings(req, res) {
  await expireHolds();
  const { page, limit, offset } = getPagination(req.query, 10);
  const filter = { user: req.auth.id };
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new HttpError(400, 'Invalid status');
    filter.status = req.query.status;
  }
  const { total, bookings } = await listBookings({ filter, limit, offset });
  res.json({ page, limit, total, bookings });
}

// GET /api/bookings/:id  -> e-ticket (owner, or admin)
async function getBookingById(req, res) {
  await expireHolds();
  const id = parseId(req.params.id, 'Booking id');
  const found = await getBooking(id, { includeUser: req.auth.role === 'admin' });
  // 404 (not 403) for other people's bookings so ids can't be probed (BR-4)
  if (!found || (req.auth.role === 'user' && found.owner !== String(req.auth.id))) throw new HttpError(404, 'Booking not found');
  res.json(found.booking);
}

// GET /api/admin/bookings?status=&movie_id=&date=&search=&page=&limit=   (admin)
async function adminBookings(req, res) {
  await expireHolds();
  const { page, limit, offset } = getPagination(req.query, 20);
  const filter = {};

  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new HttpError(400, 'Invalid status');
    filter.status = req.query.status;
  }
  if (req.query.movie_id || req.query.date) {
    const showFilter = {};
    if (req.query.movie_id) showFilter.movie = parseId(req.query.movie_id, 'movie_id');
    if (req.query.date) {
      if (!isValidDate(req.query.date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      const dayStart = new Date(`${req.query.date}T00:00:00Z`);
      showFilter.start_at = { $gte: dayStart, $lt: addMinutes(dayStart, 24 * 60) };
    }
    filter.showtime = { $in: await Showtime.find(showFilter).distinct('_id') };
  }
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    const userIds = await User.find({ $or: [{ name: rx }, { email: rx }] }).distinct('_id');
    filter.$or = [{ booking_ref: rx }, { user: { $in: userIds } }];
  }

  const { total, bookings } = await listBookings({ filter, limit, offset, includeUser: true });

  // BR-2: only Paid bookings count as confirmed / revenue
  const stats = await Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$total_amount' } } }]);
  const summary = { confirmed_bookings: 0, revenue: 0, pending: 0, cancelled: 0, expired: 0 };
  for (const s of stats) {
    if (s._id === 'Paid') { summary.confirmed_bookings = s.n; summary.revenue = s.amount; }
    else summary[String(s._id).toLowerCase()] = s.n;
  }
  res.json({ page, limit, total, summary, bookings });
}

module.exports = { createBooking, payBooking, cancelBooking, myBookings, getBookingById, adminBookings };
