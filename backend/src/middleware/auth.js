// JWT auth (NFR-5, NFR-7). Token payload: { id, role: 'user' | 'admin' }.
const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils/httpError');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set in .env - using an insecure dev secret.');
}

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  // EventSource (live seats) cannot set headers, so allow ?token= on GET requests only.
  if (req.method === 'GET' && typeof req.query.token === 'string') return req.query.token;
  return null;
}

function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) return next(new HttpError(401, 'Please log in first'));
  try {
    req.auth = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token';
    next(new HttpError(401, msg));
  }
}

// Attaches req.auth if a valid token is present, never fails.
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.auth = jwt.verify(token, SECRET);
    } catch (_) {
      /* treat as anonymous */
    }
  }
  next();
}

const requireRole = (role) => (req, res, next) => {
  if (!req.auth || req.auth.role !== role) {
    return next(new HttpError(403, role === 'admin' ? 'Admin access only' : 'Customer account required'));
  }
  next();
};

module.exports = { signToken, authenticate, optionalAuth, requireUser: requireRole('user'), requireAdmin: requireRole('admin') };
