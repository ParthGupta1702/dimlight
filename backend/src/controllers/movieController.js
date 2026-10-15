// Feature 2: Browse Movies (FR-6, FR-7)
const pool = require('../config/db');

const MOVIE_COLUMNS =
  'movie_id, title, genre, language, duration_min, poster_url, description';

// GET /api/movies?genre=Action&language=Hindi&search=dark
// Lists all movies (title, genre, language, duration, poster). Filters are optional.
async function getAllMovies(req, res, next) {
  try {
    const { genre, language, search } = req.query;
    const conditions = [];
    const params = [];

    // Parameterised placeholders (?) protect against SQL injection (NFR-6).
    if (genre) {
      conditions.push('genre = ?');
      params.push(String(genre).trim());
    }
    if (language) {
      conditions.push('language = ?');
      params.push(String(language).trim());
    }
    if (search) {
      conditions.push('title LIKE ?');
      params.push(`%${String(search).trim()}%`);
    }

    let sql = `SELECT ${MOVIE_COLUMNS} FROM Movie`;
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY title ASC';

    const [rows] = await pool.query(sql, params);
    res.json({ count: rows.length, movies: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/movies/:id
// Details of one movie - used when the user selects a movie (FR-7).
async function getMovieById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Movie id must be a positive integer' });
    }

    const [rows] = await pool.query(
      `SELECT ${MOVIE_COLUMNS} FROM Movie WHERE movie_id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// GET /api/movies/filters
// Distinct genres and languages, so the frontend can build filter dropdowns.
async function getMovieFilters(req, res, next) {
  try {
    const [genres] = await pool.query('SELECT DISTINCT genre FROM Movie ORDER BY genre');
    const [languages] = await pool.query('SELECT DISTINCT language FROM Movie ORDER BY language');
    res.json({
      genres: genres.map((g) => g.genre),
      languages: languages.map((l) => l.language),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllMovies, getMovieById, getMovieFilters };
