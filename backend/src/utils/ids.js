const { HttpError } = require('./httpError');

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

// Ids are MongoDB ObjectIds (24 hex characters) sent as strings.
function parseId(v, label = 'id') {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!OBJECT_ID_RE.test(s)) throw new HttpError(400, `${label} is not valid`);
  return s;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// duplicate key error from a single write or from insertMany
function isDuplicateKey(err) {
  if (!err) return false;
  if (err.code === 11000) return true;
  const list = err.writeErrors || [];
  return list.some((w) => w.code === 11000 || (w.err && w.err.code === 11000));
}

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });

module.exports = { parseId, escapeRegex, isDuplicateKey, naturalSort };
