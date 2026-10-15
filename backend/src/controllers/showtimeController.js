// Feature 3: View Showtimes (FR-8, FR-9) + Feature 10: Manage Showtimes (FR-27..FR-29)
const { Movie, Theatre, Screen, Showtime, SeatLock } = require('../models');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/ids');
const { isValidDate, isValidTime, buildWindow, nowLocal, toSqlDateTime, addMinutes } = require('../utils/time');

const BUFFER_MIN = 15; // changeover gap between shows on the same screen

const POPULATE = [
  { path: 'movie', select: 'title' },
  { path: 'screen', populate: { path: 'theatre' } },
];

function shape(s, taken) {
  const total = s.screen.seats.length;
  const available = total - taken;
  const start = toSqlDateTime(s.start_at);
  return {
    showtime_id: String(s._id),
    movie_id: String(s.movie._id),
    movie_title: s.movie.title,
    date: start.slice(0, 10),
    time: start.slice(11, 16),
    start_at: start,
    end_at: toSqlDateTime(s.end_at),
    price: Number(s.price),
    theatre: { theatre_id: String(s.screen.theatre._id), name: s.screen.theatre.name, city: s.screen.theatre.city },
    screen: { screen_id: String(s.screen._id), name: s.screen.name },
    total_seats: total,
    available_seats: available,
    // lets the UI colour-code / animate a "filling fast" badge without extra logic
    availability: available <= 0 ? 'sold_out' : available <= total * 0.2 ? 'filling_fast' : 'available',
  };
}

// How many seats are locked (held or paid) for each showtime
async function takenCounts(showtimeIds) {
  if (!showtimeIds.length) return new Map();
  const rows = await SeatLock.aggregate([
    { $match: { showtime: { $in: showtimeIds }, active: true } },
    { $group: { _id: '$showtime', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

async function loadShowtime(id) {
  const s = await Showtime.findById(id).populate(POPULATE).lean();
  if (!s) return null;
  const taken = await SeatLock.countDocuments({ showtime: s._id, active: true });
  return shape(s, taken);
}

// GET /api/movies/:id/showtimes?date=YYYY-MM-DD   -> upcoming showtimes grouped by date
async function getShowtimesForMovie(req, res) {
  const movieId = parseId(req.params.id, 'Movie id');
  const movie = await Movie.findById(movieId).select('title').lean();
  if (!movie) throw new HttpError(404, 'Movie not found');

  const filter = { movie: movieId, start_at: { $gt: nowLocal() } };
  if (req.query.date) {
    if (!isValidDate(req.query.date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
    const dayStart = new Date(`${req.query.date}T00:00:00Z`);
    filter.start_at = { $gt: nowLocal(), $gte: dayStart, $lt: addMinutes(dayStart, 24 * 60) };
  }
  const rows = await Showtime.find(filter).sort({ start_at: 1 }).populate(POPULATE).lean();
  const taken = await takenCounts(rows.map((r) => r._id));

  const dates = [];
  for (const r of rows.map((s) => shape(s, taken.get(String(s._id)) || 0))) {
    let group = dates[dates.length - 1];
    if (!group || group.date !== r.date) dates.push((group = { date: r.date, showtimes: [] }));
    group.showtimes.push(r);
  }
  res.json({ movie: { movie_id: String(movie._id), title: movie.title }, count: rows.length, dates });
}

// GET /api/showtimes/:id
async function getShowtime(req, res) {
  const s = await loadShowtime(parseId(req.params.id, 'Showtime id'));
  if (!s) throw new HttpError(404, 'Showtime not found');
  res.json(s);
}

// GET /api/theatres  -> theatres with their screens (for the admin showtime form)
async function getTheatres(req, res) {
  const [theatres, screens] = await Promise.all([
    Theatre.find().sort({ _id: 1 }).lean(),
    Screen.find().sort({ _id: 1 }).select('theatre name').lean(),
  ]);
  res.json({
    theatres: theatres.map((t) => ({
      theatre_id: String(t._id),
      name: t.name,
      city: t.city,
      screens: screens.filter((s) => String(s.theatre) === String(t._id)).map((s) => ({ screen_id: String(s._id), name: s.name })),
    })),
  });
}

function parsePrice(v) {
  const p = Number(v);
  if (!Number.isFinite(p) || p <= 0 || p > 5000) throw new HttpError(400, 'Price must be between 0 and 5000');
  return Math.round(p * 100) / 100;
}

// BR-5 + "overlapping showtimes on the same screen are prevented"
async function assertNoOverlap(screenId, startAt, endAt, ignoreId = null) {
  const filter = { screen: screenId, start_at: { $lt: endAt }, end_at: { $gt: startAt } };
  if (ignoreId) filter._id = { $ne: ignoreId };
  const clash = await Showtime.findOne(filter).select('start_at').lean();
  if (clash) {
    throw new HttpError(409, `This screen already has a show at ${toSqlDateTime(clash.start_at).slice(0, 16)} that overlaps`, {
      conflicting_showtime_id: String(clash._id),
    });
  }
}

function assertInFuture(startAt) {
  if (!(startAt > nowLocal())) throw new HttpError(400, 'Showtime must be in the future');
}

async function assertScreenExists(screenId) {
  if (!(await Screen.exists({ _id: screenId }))) throw new HttpError(404, 'Screen not found');
}

// POST /api/showtimes (admin)  { movie_id, screen_id, date, time, price }
async function createShowtime(req, res) {
  const movieId = parseId(req.body.movie_id, 'movie_id');
  const screenId = parseId(req.body.screen_id, 'screen_id');
  const { date, time } = req.body;
  if (!isValidDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
  if (!isValidTime(time)) throw new HttpError(400, 'time must be HH:MM (24h)');
  const price = parsePrice(req.body.price);

  const movie = await Movie.findById(movieId).select('duration_min').lean();
  if (!movie) throw new HttpError(404, 'Movie not found');
  await assertScreenExists(screenId);

  const { startAt, endAt } = buildWindow(date, time, movie.duration_min, BUFFER_MIN);
  assertInFuture(startAt);
  await assertNoOverlap(screenId, startAt, endAt);

  const s = await Showtime.create({ movie: movieId, screen: screenId, start_at: startAt, end_at: endAt, price });
  res.status(201).json(await loadShowtime(s._id));
}

// PUT /api/showtimes/:id (admin) - send only what changes
async function updateShowtime(req, res) {
  const id = parseId(req.params.id, 'Showtime id');
  const cur = await Showtime.findById(id).lean();
  if (!cur) throw new HttpError(404, 'Showtime not found');
  const curStart = toSqlDateTime(cur.start_at);

  const b = req.body;
  const movieId = b.movie_id !== undefined ? parseId(b.movie_id, 'movie_id') : String(cur.movie);
  const screenId = b.screen_id !== undefined ? parseId(b.screen_id, 'screen_id') : String(cur.screen);
  const date = b.date !== undefined ? b.date : curStart.slice(0, 10);
  const time = b.time !== undefined ? b.time : curStart.slice(11, 16);
  const price = b.price !== undefined ? parsePrice(b.price) : Number(cur.price);
  if (!isValidDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
  if (!isValidTime(time)) throw new HttpError(400, 'time must be HH:MM (24h)');

  if (screenId !== String(cur.screen) || movieId !== String(cur.movie)) {
    if (await SeatLock.exists({ showtime: id, active: true })) {
      throw new HttpError(409, 'Seats are already booked for this showtime, so its movie/screen cannot change');
    }
  }
  const movie = await Movie.findById(movieId).select('duration_min').lean();
  if (!movie) throw new HttpError(404, 'Movie not found');
  await assertScreenExists(screenId);

  const { startAt, endAt } = buildWindow(date, time, movie.duration_min, BUFFER_MIN);
  assertInFuture(startAt);
  await assertNoOverlap(screenId, startAt, endAt, id);

  await Showtime.updateOne({ _id: id }, { $set: { movie: movieId, screen: screenId, start_at: startAt, end_at: endAt, price } });
  res.json(await loadShowtime(id));
}

module.exports = { getShowtimesForMovie, getShowtime, getTheatres, createShowtime, updateShowtime, loadShowtime };
