const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler: ah } = require('../utils/httpError');
const { authenticate, optionalAuth, requireUser, requireAdmin } = require('../middleware/auth');
const auth = require('../controllers/authController');
const movies = require('../controllers/movieController');
const showtimes = require('../controllers/showtimeController');
const seats = require('../controllers/seatController');
const bookings = require('../controllers/bookingController');
const motion = require('../config/motion');

const router = express.Router();

// slow down password guessing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again in a few minutes' },
});

// --- UI helpers ---
router.get('/ui/motion', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(motion());
});

// --- Auth (Features 1 & 8) ---
router.post('/auth/register', authLimiter, ah(auth.register));
router.post('/auth/login', authLimiter, ah(auth.login));
router.post('/auth/admin/login', authLimiter, ah(auth.adminLogin));
router.get('/auth/me', authenticate, ah(auth.me));

// --- Movies (Features 2 & 9) ---
router.get('/movies', ah(movies.getAllMovies));
router.get('/movies/filters', ah(movies.getMovieFilters)); // before /:id
router.get('/movies/featured', ah(movies.getFeaturedMovies)); // home page hero, before /:id
router.get('/movies/:id', ah(movies.getMovieById));
router.get('/movies/:id/showtimes', ah(showtimes.getShowtimesForMovie)); // Feature 3
router.post('/movies', authenticate, requireAdmin, ah(movies.createMovie));
router.put('/movies/:id', authenticate, requireAdmin, ah(movies.updateMovie));
router.delete('/movies/:id', authenticate, requireAdmin, ah(movies.deleteMovie));

// --- Theatres, Showtimes & Seats (Features 3, 4, 10) ---
router.get('/theatres', ah(showtimes.getTheatres));
router.get('/showtimes/:id', ah(showtimes.getShowtime));
router.get('/showtimes/:id/seats', optionalAuth, ah(seats.getSeats));
router.get('/showtimes/:id/seats/stream', ah(seats.streamSeats));
router.post('/showtimes', authenticate, requireAdmin, ah(showtimes.createShowtime));
router.put('/showtimes/:id', authenticate, requireAdmin, ah(showtimes.updateShowtime));

// --- Bookings (Features 5, 6, 7) ---
router.post('/bookings', authenticate, requireUser, ah(bookings.createBooking));
router.get('/bookings/my', authenticate, requireUser, ah(bookings.myBookings)); // before /:id
router.get('/bookings/:id', authenticate, ah(bookings.getBookingById));
router.post('/bookings/:id/pay', authenticate, requireUser, ah(bookings.payBooking));
router.post('/bookings/:id/cancel', authenticate, requireUser, ah(bookings.cancelBooking));

// --- Admin (Feature 11) ---
router.get('/admin/bookings', authenticate, requireAdmin, ah(bookings.adminBookings));

module.exports = router;
