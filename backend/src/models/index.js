// All collections. Entity names match the SRS / class diagram:
// User, Admin, Movie, Theatre, Screen (with embedded Seats), Showtime, Booking (with embedded Payment).
// SeatLock is the guard that makes double-booking impossible (see the unique index below).
const { Schema, model } = require('mongoose');

const User = model('User', new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // FR-2: unique email
    password_hash: { type: String, required: true }, // NFR-4: bcrypt hash
  },
  { timestamps: true }
));

const Admin = model('Admin', new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
  },
  { timestamps: true }
));

const movieSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    genre: { type: String, required: true, trim: true, maxlength: 50, index: true },
    language: { type: String, required: true, trim: true, maxlength: 30, index: true },
    duration_min: { type: Number, required: true, min: 1, max: 600 },
    poster_url: { type: String, default: null },
    description: { type: String, default: null },
    featured: { type: Boolean, default: false, index: true }, // shown in the home page hero
  },
  { timestamps: true }
);
const Movie = model('Movie', movieSchema);

const Theatre = model('Theatre', new Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
}));

// Fixed, pre-configured seat inventory per Screen (dynamic layouts are out of scope in the SRS)
const Screen = model('Screen', (() => {
  const s = new Schema({
    theatre: { type: Schema.Types.ObjectId, ref: 'Theatre', required: true },
    name: { type: String, required: true },
    seats: [{ _id: false, row: String, number: Number, label: String }], // label e.g. "A5" is the seat id
  });
  s.index({ theatre: 1, name: 1 }, { unique: true });
  return s;
})());

// BR-5: a Showtime links exactly one Movie, one Screen (and so one Theatre)
const Showtime = model('Showtime', (() => {
  const s = new Schema({
    movie: { type: Schema.Types.ObjectId, ref: 'Movie', required: true },
    screen: { type: Schema.Types.ObjectId, ref: 'Screen', required: true },
    // Stored as "cinema local time" written as UTC (no timezone conversions anywhere)
    start_at: { type: Date, required: true },
    end_at: { type: Date, required: true }, // start + movie duration + changeover gap
    price: { type: Number, required: true, min: 1 },
  });
  s.index({ movie: 1, start_at: 1 });
  s.index({ screen: 1, start_at: 1, end_at: 1 });
  return s;
})());

// status: Pending (seats held) -> Paid | Cancelled | Expired
const Booking = model('Booking', (() => {
  const s = new Schema(
    {
      booking_ref: { type: String, required: true, unique: true },
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      showtime: { type: Schema.Types.ObjectId, ref: 'Showtime', required: true },
      seats: [String],
      status: { type: String, enum: ['Pending', 'Paid', 'Cancelled', 'Expired'], default: 'Pending' },
      total_amount: { type: Number, required: true },
      hold_expires_at: { type: Date, default: null },
      // Payment (mock, no gateway) is embedded: one payment per booking
      payment: {
        type: new Schema(
          {
            method: { type: String, enum: ['card', 'upi', 'netbanking', 'wallet'] },
            status: { type: String, enum: ['Success', 'Failed'], default: 'Success' },
            amount: Number,
            transaction_ref: String,
            paid_at: Date,
          },
          { _id: false }
        ),
        default: undefined,
      },
    },
    { timestamps: true }
  );
  s.index({ user: 1, createdAt: -1 });
  s.index({ status: 1, hold_expires_at: 1 });
  s.index({ showtime: 1 });
  return s;
})());

// BR-1: one ACTIVE lock per seat per showtime. The partial unique index means the database itself
// rejects a second active lock, so two people can never hold or buy the same seat, even if their
// requests arrive at the same instant. Released locks stay (active:false) as history.
const SeatLock = model('SeatLock', (() => {
  const s = new Schema({
    showtime: { type: Schema.Types.ObjectId, ref: 'Showtime', required: true },
    seat: { type: String, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    active: { type: Boolean, default: true },
  });
  s.index({ showtime: 1, seat: 1 }, { unique: true, partialFilterExpression: { active: true } });
  s.index({ booking: 1 });
  return s;
})());

module.exports = { User, Admin, Movie, Theatre, Screen, Showtime, Booking, SeatLock };
