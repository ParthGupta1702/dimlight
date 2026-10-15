// Feature 2: Browse Movies (FR-6, FR-7) + Feature 9: Manage Movies (FR-24..FR-26)
const { Movie, Showtime, Booking } = require('../models');
const { HttpError } = require('../utils/httpError');
const { parseId, escapeRegex } = require('../utils/ids');
const { addMinutes, nowLocal, toSqlDateTime } = require('../utils/time');

function shape(m) {
  return {
    movie_id: String(m._id),
    title: m.title,
    genre: m.genre,
    language: m.language,
    duration_min: m.duration_min,
    poster_url: m.poster_url || null,
    description: m.description || null,
    featured: Boolean(m.featured),
  };
}

// GET /api/movies/featured  -> movies for the home page hero, each with its next show
// Movies with an upcoming show come first (soonest first), then the rest.
async function getFeaturedMovies(req, res) {
  const movies = await Movie.find({ featured: true }).sort({ title: 1 }).limit(8).lean();
  if (!movies.length) return res.json({ count: 0, movies: [] });

  const next = await Showtime.aggregate([
    { $match: { movie: { $in: movies.map((m) => m._id) }, start_at: { $gt: nowLocal() } } },
    { $sort: { start_at: 1 } },
    { $group: { _id: '$movie', showtime_id: { $first: '$_id' }, start_at: { $first: '$start_at' }, from_price: { $min: '$price' }, upcoming: { $sum: 1 } } },
  ]);
  const firstShows = await Showtime.find({ _id: { $in: next.map((n) => n.showtime_id) } })
    .populate({ path: 'screen', select: 'name theatre', populate: { path: 'theatre', select: 'name city' } })
    .lean();
  const showById = new Map(firstShows.map((s) => [String(s._id), s]));
  const nextByMovie = new Map(next.map((n) => [String(n._id), n]));

  const out = movies.map((m) => {
    const n = nextByMovie.get(String(m._id));
    const s = n && showById.get(String(n.showtime_id));
    return {
      ...shape(m),
      next_show: n && s
        ? {
            showtime_id: String(n.showtime_id),
            start_at: toSqlDateTime(n.start_at),
            theatre: s.screen.theatre.name,
            screen: s.screen.name,
            from_price: Number(n.from_price),
            upcoming_shows: n.upcoming,
          }
        : null,
    };
  });
  out.sort((a, b) => (a.next_show ? 0 : 1) - (b.next_show ? 0 : 1) || (a.next_show && b.next_show ? a.next_show.start_at.localeCompare(b.next_show.start_at) : 0));
  res.json({ count: out.length, movies: out });
}

// GET /api/movies?genre=&language=&search=
async function getAllMovies(req, res) {
  const { genre, language, search } = req.query;
  const filter = {};
  if (genre) filter.genre = String(genre).trim();
  if (language) filter.language = String(language).trim();
  if (search) filter.title = new RegExp(escapeRegex(String(search).trim()), 'i');

  const rows = await Movie.find(filter).sort({ title: 1 }).lean();
  res.json({ count: rows.length, movies: rows.map(shape) });
}

// GET /api/movies/filters
async function getMovieFilters(req, res) {
  const [genres, languages] = await Promise.all([Movie.distinct('genre'), Movie.distinct('language')]);
  res.json({ genres: genres.sort(), languages: languages.sort() });
}

// GET /api/movies/:id
async function getMovieById(req, res) {
  const m = await Movie.findById(parseId(req.params.id, 'Movie id')).lean();
  if (!m) throw new HttpError(404, 'Movie not found');
  res.json(shape(m));
}

function validateMovie(body, partial = false) {
  const out = {};
  const str = (key, max, label) => {
    if (body[key] === undefined) { if (!partial) throw new HttpError(400, `${label} is required`); return; }
    const v = typeof body[key] === 'string' ? body[key].trim() : '';
    if (!v || v.length > max) throw new HttpError(400, `${label} is required (max ${max} characters)`);
    out[key] = v;
  };
  str('title', 150, 'Title');
  str('genre', 50, 'Genre');
  str('language', 30, 'Language');

  if (body.duration_min === undefined) {
    if (!partial) throw new HttpError(400, 'Duration is required');
  } else {
    const d = Number(body.duration_min);
    if (!Number.isInteger(d) || d < 1 || d > 600) throw new HttpError(400, 'Duration must be 1-600 minutes');
    out.duration_min = d;
  }

  if (body.poster_url !== undefined) {
    const p = body.poster_url === null ? '' : String(body.poster_url).trim();
    if (p && !/^https?:\/\/\S+$/i.test(p)) throw new HttpError(400, 'Poster must be an http(s) URL');
    out.poster_url = p || null;
  }
  if (body.description !== undefined) {
    out.description = body.description === null ? null : String(body.description).trim().slice(0, 2000) || null;
  }
  if (body.featured !== undefined) {
    if (![true, false, 'true', 'false'].includes(body.featured)) throw new HttpError(400, 'featured must be true or false');
    out.featured = body.featured === true || body.featured === 'true';
  }
  return out;
}

// POST /api/movies  (admin)
async function createMovie(req, res) {
  const m = validateMovie(req.body);
  const doc = await Movie.create(m);
  res.status(201).json(shape(doc.toObject()));
}

// PUT /api/movies/:id  (admin) - send only the fields to change
async function updateMovie(req, res) {
  const id = parseId(req.params.id, 'Movie id');
  const m = validateMovie(req.body, true);
  if (!Object.keys(m).length) throw new HttpError(400, 'Nothing to update');

  const doc = await Movie.findByIdAndUpdate(id, { $set: m }, { new: true }).lean();
  if (!doc) throw new HttpError(404, 'Movie not found');

  // duration changed -> keep showtime end times correct (duration + 15 min changeover)
  if (m.duration_min !== undefined) {
    const shows = await Showtime.find({ movie: id }).select('start_at').lean();
    if (shows.length) {
      await Showtime.bulkWrite(
        shows.map((s) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { end_at: addMinutes(s.start_at, m.duration_min + 15) } } } }))
      );
    }
  }
  res.json(shape(doc));
}

// DELETE /api/movies/:id  (admin) - blocked if any booking exists on its showtimes
async function deleteMovie(req, res) {
  const id = parseId(req.params.id, 'Movie id');
  const movie = await Movie.findById(id).select('_id').lean();
  if (!movie) throw new HttpError(404, 'Movie not found');

  const showIds = await Showtime.find({ movie: id }).distinct('_id');
  if (showIds.length && (await Booking.exists({ showtime: { $in: showIds } }))) {
    throw new HttpError(409, 'This movie has bookings on its showtimes, so it cannot be deleted');
  }
  await Showtime.deleteMany({ movie: id });
  await Movie.deleteOne({ _id: id });
  res.json({ deleted: true, movie_id: id });
}

module.exports = { getAllMovies, getFeaturedMovies, getMovieFilters, getMovieById, createMovie, updateMovie, deleteMovie };
