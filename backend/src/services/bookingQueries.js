// Shared booking read queries (user history, e-ticket, admin list).
const { Booking } = require('../models');
const { toSqlDateTime } = require('../utils/time');
const { naturalSort } = require('../utils/ids');

const POPULATE = [
  { path: 'user', select: 'name email' },
  {
    path: 'showtime',
    populate: [
      { path: 'movie', select: 'title poster_url language duration_min' },
      { path: 'screen', select: 'name theatre', populate: { path: 'theatre', select: 'name city' } },
    ],
  },
];

function shape(b, { includeUser = false } = {}) {
  const st = b.showtime;
  const hold = b.hold_expires_at ? Math.max(0, Math.floor((new Date(b.hold_expires_at).getTime() - Date.now()) / 1000)) : 0;
  const out = {
    booking_id: String(b._id),
    booking_ref: b.booking_ref,
    status: b.status,
    is_confirmed: b.status === 'Paid', // BR-2: only Paid counts as confirmed
    total_amount: Number(b.total_amount),
    created_at: b.createdAt ? new Date(b.createdAt).toISOString() : null,
    movie: {
      movie_id: String(st.movie._id),
      title: st.movie.title,
      poster_url: st.movie.poster_url || null,
      language: st.movie.language,
      duration_min: st.movie.duration_min,
    },
    showtime: { showtime_id: String(st._id), start_at: toSqlDateTime(st.start_at), price: Number(st.price) },
    theatre: { name: st.screen.theatre.name, city: st.screen.theatre.city },
    screen: st.screen.name,
    seats: [...(b.seats || [])].sort(naturalSort),
    payment: {
      status: (b.payment && b.payment.status) || 'Unpaid',
      ...(b.payment && b.payment.method
        ? { method: b.payment.method, transaction_ref: b.payment.transaction_ref, paid_at: new Date(b.payment.paid_at).toISOString() }
        : {}),
    },
  };
  if (b.status === 'Pending') {
    out.hold_expires_at = new Date(b.hold_expires_at).toISOString();
    out.hold_seconds_left = hold;
  }
  if (includeUser) out.user = { user_id: String(b.user._id), name: b.user.name, email: b.user.email };
  return out;
}

async function listBookings({ filter = {}, limit = 20, offset = 0, includeUser = false }) {
  const [rows, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).populate(POPULATE).lean(),
    Booking.countDocuments(filter),
  ]);
  return { total, bookings: rows.map((r) => shape(r, { includeUser })) };
}

async function getBooking(id, { includeUser = false } = {}) {
  const b = await Booking.findById(id).populate(POPULATE).lean();
  if (!b) return null;
  return { owner: String(b.user._id), booking: shape(b, { includeUser }) };
}

module.exports = { listBookings, getBooking };
