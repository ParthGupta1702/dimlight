const express = require('express');
const {
  getAllMovies,
  getMovieById,
  getMovieFilters,
} = require('../controllers/movieController');

const router = express.Router();

router.get('/', getAllMovies);
router.get('/filters', getMovieFilters); // must come before /:id
router.get('/:id', getMovieById);

module.exports = router;
