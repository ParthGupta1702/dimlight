const express = require('express');
const cors = require('cors');
const movieRoutes = require('./routes/movieRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// One router per entity (maintainability NFR)
app.use('/api/movies', movieRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
