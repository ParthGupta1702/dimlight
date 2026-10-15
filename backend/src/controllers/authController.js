// Feature 1 (Register / Login) and Feature 8 (Admin Login) - FR-1..FR-5, FR-21..FR-23
const bcrypt = require('bcryptjs');
const { User, Admin } = require('../models');
const { signToken } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');
const { isDuplicateKey } = require('../utils/ids');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanEmail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

async function register(req, res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = cleanEmail(req.body.email);
  const password = req.body.password;

  if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Name must be 2-100 characters');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new HttpError(400, 'Password must be 8-72 characters');
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const u = await User.create({ name, email, password_hash: hash });
    const user = { id: String(u._id), name, email };
    res.status(201).json({ token: signToken({ id: user.id, role: 'user' }), user });
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}

async function login(req, res) {
  const email = cleanEmail(req.body.email);
  const password = req.body.password;
  if (!email || typeof password !== 'string') throw new HttpError(400, 'Email and password are required');

  const u = await User.findOne({ email }).lean();
  // same message for "no such user" and "wrong password" so emails can't be probed
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Invalid email or password');

  const id = String(u._id);
  res.json({ token: signToken({ id, role: 'user' }), user: { id, name: u.name, email: u.email } });
}

async function adminLogin(req, res) {
  const email = cleanEmail(req.body.email);
  const password = req.body.password;
  if (!email || typeof password !== 'string') throw new HttpError(400, 'Email and password are required');

  const a = await Admin.findOne({ email }).lean();
  if (!a || !(await bcrypt.compare(password, a.password_hash))) throw new HttpError(401, 'Invalid admin credentials');

  const id = String(a._id);
  res.json({ token: signToken({ id, role: 'admin' }), admin: { id, name: a.name, email: a.email } });
}

async function me(req, res) {
  const Model = req.auth.role === 'admin' ? Admin : User;
  const a = await Model.findById(req.auth.id).select('name email').lean();
  if (!a) throw new HttpError(401, 'Account no longer exists');
  res.json({ role: req.auth.role, id: String(a._id), name: a.name, email: a.email });
}

module.exports = { register, login, adminLogin, me };
