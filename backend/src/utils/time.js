// Date helpers. Showtimes are "cinema local time": a show at 18:30 is stored as 18:30 UTC and compared
// with the server's local clock written the same way. No time zone conversion ever happens.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Date -> 'YYYY-MM-DD HH:MM:SS'
function toSqlDateTime(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function addMinutes(d, mins) {
  return new Date(d.getTime() + mins * 60000);
}

function isValidDate(s) {
  return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function isValidTime(s) {
  return typeof s === 'string' && TIME_RE.test(s);
}

// "now" on the cinema's wall clock, in the same naive-UTC form as stored showtimes
function nowLocal() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
}

// ('2026-10-20', '18:30', 152, 15) -> { startAt: Date, endAt: Date }
function buildWindow(date, time, durationMin, bufferMin = 15) {
  const start = new Date(`${date}T${time}:00Z`);
  return { startAt: start, endAt: addMinutes(start, durationMin + bufferMin) };
}

module.exports = { toSqlDateTime, addMinutes, isValidDate, isValidTime, nowLocal, buildWindow };
