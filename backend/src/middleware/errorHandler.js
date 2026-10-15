// Central error handler: logs the real error, returns a safe message.
function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
