const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
// gzip JSON for faster loads (NFR-1) - but never buffer the live seat stream
app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

// the website (frontend) is served from the same server: open http://localhost:5000
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
