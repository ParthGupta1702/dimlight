// npm run test:smoke   (server must be running; uses BASE_URL or http://localhost:5000)
// Walks through all 11 features and checks the important rules. Creates throwaway users.
require('dotenv').config();
const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
let pass = 0, fail = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
}

async function main() {
  const tag = Date.now();
  console.log('\n[Auth]');
  let r = await call('POST', '/auth/register', { body: { name: 'Test A', email: `a${tag}@t.com`, password: 'password123' } });
  check('register user A', r.status === 201 && r.data.token);
  const A = r.data.token;
  r = await call('POST', '/auth/register', { body: { name: 'Test A', email: `a${tag}@t.com`, password: 'password123' } });
  check('duplicate email rejected (409)', r.status === 409);
  r = await call('POST', '/auth/register', { body: { name: 'Test B', email: `b${tag}@t.com`, password: 'password123' } });
  const B = r.data.token;
  r = await call('POST', '/auth/login', { body: { email: `a${tag}@t.com`, password: 'wrongpass' } });
  check('wrong password rejected (401)', r.status === 401);
  r = await call('POST', '/auth/login', { body: { email: `a${tag}@t.com`, password: 'password123' } });
  check('login works', r.status === 200 && r.data.token);
  r = await call('POST', '/auth/admin/login', { body: { email: process.env.ADMIN_EMAIL || 'admin@dimlight.com', password: process.env.ADMIN_PASSWORD || 'Admin@12345' } });
  check('admin login', r.status === 200 && r.data.token);
  const ADMIN = r.data.token;
  r = await call('POST', '/auth/admin/login', { body: { email: `a${tag}@t.com`, password: 'password123' } });
  check('user cannot log in as admin', r.status === 401);

  console.log('\n[Movies & showtimes]');
  r = await call('GET', '/movies');
  check('list movies', r.status === 200 && r.data.count >= 6);
  r = await call('GET', '/movies?language=Hindi');
  check('filter by language', r.data.movies.every((m) => m.language === 'Hindi'));
  // ids are MongoDB ObjectIds, so look up a real movie that has upcoming showtimes
  const all = (await call('GET', '/movies')).data.movies;
  let bookedMovieId;
  for (const m of all) {
    r = await call('GET', `/movies/${m.movie_id}/showtimes`);
    if (r.data.dates && r.data.dates.length) { bookedMovieId = m.movie_id; break; }
  }
  check('showtimes grouped by date', r.status === 200 && r.data.dates.length > 0 && r.data.dates[0].showtimes[0].theatre.name);
  const show = r.data.dates[0].showtimes[0];
  console.log('   using showtime', show.showtime_id, show.date, show.time, show.theatre.name, show.screen.name);
  r = await call('POST', '/movies', { token: A, body: { title: 'X', genre: 'g', language: 'l', duration_min: 90 } });
  check('user cannot add movie (403)', r.status === 403);
  r = await call('POST', '/movies', { body: { title: 'X' } });
  check('anonymous cannot add movie (401)', r.status === 401);
  r = await call('POST', '/movies', { token: ADMIN, body: { title: 'Smoke Test Film', genre: 'Drama', language: 'English', duration_min: 100 } });
  check('admin adds movie', r.status === 201);
  const newMovie = r.data.movie_id;
  r = await call('PUT', `/movies/${newMovie}`, { token: ADMIN, body: { genre: 'Thriller' } });
  check('admin edits movie', r.status === 200 && r.data.genre === 'Thriller');
  r = await call('GET', '/movies/featured');
  check('featured movies for the hero', r.status === 200 && r.data.count >= 1 && 'next_show' in r.data.movies[0]);
  r = await call('PUT', `/movies/${newMovie}`, { token: ADMIN, body: { featured: true } });
  check('admin features a movie', r.status === 200 && r.data.featured === true);
  r = await call('GET', '/movies/featured');
  check('it appears in the hero list', r.data.movies.some((m) => m.movie_id === newMovie));
  r = await call('PUT', `/movies/${newMovie}`, { token: ADMIN, body: { featured: 'maybe' } });
  check('bad featured value -> 400', r.status === 400);

  console.log('\n[Admin showtimes]');
  const t = await call('GET', '/theatres');
  const screenId = t.data.theatres[0].screens[0].screen_id;
  const day = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  r = await call('POST', '/showtimes', { token: ADMIN, body: { movie_id: newMovie, screen_id: screenId, date: day, time: '12:00', price: 250 } });
  check('admin adds showtime', r.status === 201);
  const stId = r.data.showtime_id;
  r = await call('POST', '/showtimes', { token: ADMIN, body: { movie_id: newMovie, screen_id: screenId, date: day, time: '12:30', price: 250 } });
  check('overlapping showtime rejected (409)', r.status === 409);
  r = await call('PUT', `/showtimes/${stId}`, { token: ADMIN, body: { time: '16:00' } });
  check('admin edits showtime', r.status === 200 && r.data.time === '16:00');
  r = await call('POST', '/showtimes', { token: ADMIN, body: { movie_id: newMovie, screen_id: screenId, date: '2020-01-01', time: '10:00', price: 100 } });
  check('past showtime rejected (400)', r.status === 400);

  console.log('\n[Seats & booking]');
  r = await call('GET', `/showtimes/${show.showtime_id}/seats`, { token: A });
  check('seat grid', r.status === 200 && r.data.rows.length === 8 && r.data.summary.available > 0);
  const seats = r.data.rows[0].seats;
  const [s1, s2, s3] = seats.map((s) => s.seat_id);

  r = await call('POST', '/bookings', { body: { showtime_id: show.showtime_id, seat_ids: [s1] } });
  check('booking needs login (401)', r.status === 401);

  // live update stream
  const events = [];
  const ac = new AbortController();
  const sse = fetch(`${BASE}/api/showtimes/${show.showtime_id}/seats/stream`, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader(); const dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; events.push(dec.decode(value)); }
  }).catch(() => {});
  await new Promise((x) => setTimeout(x, 300));

  // race: A and B both try seat s1 at the same instant
  const [ra, rb] = await Promise.all([
    call('POST', '/bookings', { token: A, body: { showtime_id: show.showtime_id, seat_ids: [s1, s2] } }),
    call('POST', '/bookings', { token: B, body: { showtime_id: show.showtime_id, seat_ids: [s1] } }),
  ]);
  const winners = [ra, rb].filter((x) => x.status === 201).length;
  check('double-booking race: exactly one winner', winners === 1, `${ra.status}/${rb.status}`);
  const winnerToken = ra.status === 201 ? A : B;
  const loser = ra.status === 201 ? rb : ra;
  check('loser gets 409 with seat ids', loser.status === 409 && loser.data.unavailable_seat_ids);
  const booking = (ra.status === 201 ? ra : rb).data.booking;
  check('booking is Pending with hold timer', booking.status === 'Pending' && booking.hold_seconds_left > 200);

  r = await call('GET', `/showtimes/${show.showtime_id}/seats`, { token: winnerToken });
  const flat = r.data.rows.flatMap((x) => x.seats);
  check('winner sees own seat as "yours"', flat.find((s) => s.seat_id === s1).status === 'yours');
  r = await call('GET', `/showtimes/${show.showtime_id}/seats`);
  check('anonymous sees it as "held"', r.data.rows.flatMap((x) => x.seats).find((s) => s.seat_id === s1).status === 'held');

  r = await call('POST', '/bookings', { token: winnerToken, body: { showtime_id: show.showtime_id, seat_ids: [s3] } });
  check('re-picking replaces earlier hold', r.status === 201);
  const bk = r.data.booking;
  r = await call('GET', `/showtimes/${show.showtime_id}/seats`);
  check('old seats released after re-pick', r.data.rows.flatMap((x) => x.seats).find((s) => s.seat_id === s1).status === 'available');

  console.log('\n[Payment & tickets]');
  r = await call('POST', `/bookings/${bk.booking_id}/pay`, { token: winnerToken === A ? B : A, body: { method: 'upi' } });
  check("cannot pay someone else's booking (404)", r.status === 404);
  r = await call('POST', `/bookings/${bk.booking_id}/pay`, { token: winnerToken, body: { method: 'bitcoin' } });
  check('bad payment method rejected (400)', r.status === 400);
  r = await call('POST', `/bookings/${bk.booking_id}/pay`, { token: winnerToken, body: { method: 'upi' } });
  check('mock payment succeeds -> Paid', r.status === 200 && r.data.booking.status === 'Paid' && r.data.booking.payment.status === 'Success');
  r = await call('POST', `/bookings/${bk.booking_id}/pay`, { token: winnerToken, body: { method: 'upi' } });
  check('paying twice rejected (409)', r.status === 409);
  r = await call('POST', `/bookings/${bk.booking_id}/cancel`, { token: winnerToken });
  check('paid booking cannot be cancelled (409)', r.status === 409);
  r = await call('GET', `/bookings/${bk.booking_id}`, { token: winnerToken });
  check('e-ticket details', r.status === 200 && r.data.seats.length === 1 && r.data.movie.title && r.data.theatre.name && r.data.screen);
  r = await call('GET', `/bookings/${bk.booking_id}`, { token: winnerToken === A ? B : A });
  check("other user cannot read it (404)", r.status === 404);
  r = await call('GET', '/bookings/my', { token: winnerToken });
  check('booking history', r.status === 200 && r.data.total >= 2 && r.data.bookings.every((b) => b.booking_id));

  r = await call('POST', '/bookings', { token: winnerToken === A ? B : A, body: { showtime_id: show.showtime_id, seat_ids: [s3] } });
  check('paid seat cannot be booked (409)', r.status === 409);

  // cancel flow
  r = await call('POST', '/bookings', { token: B, body: { showtime_id: show.showtime_id, seat_ids: [seats[5].seat_id] } });
  const toCancel = r.data.booking.booking_id;
  r = await call('POST', `/bookings/${toCancel}/cancel`, { token: B });
  check('pending booking can be cancelled', r.status === 200 && r.data.booking.status === 'Cancelled');

  console.log('\n[Admin bookings]');
  r = await call('GET', '/admin/bookings', { token: A });
  check('user cannot view admin bookings (403)', r.status === 403);
  r = await call('GET', '/admin/bookings?status=Paid', { token: ADMIN });
  check('admin sees all bookings + summary', r.status === 200 && r.data.summary.confirmed_bookings >= 1 && r.data.bookings[0].user.email && r.data.bookings[0].payment);
  r = await call('GET', `/bookings/${bk.booking_id}`, { token: ADMIN });
  check('admin can open any e-ticket', r.status === 200 && r.data.user);

  console.log('\n[Cleanup rules & misc]');
  r = await call('DELETE', `/movies/${newMovie}`, { token: ADMIN });
  check('movie without bookings deletes', r.status === 200);
  r = await call('DELETE', `/movies/${bookedMovieId}`, { token: ADMIN });
  check('movie with bookings blocked (409)', r.status === 409);
  r = await call('GET', '/ui/motion');
  check('motion tokens', r.status === 200 && r.data.durations && r.data.seatHold.seconds > 0);
  r = await call('GET', '/movies/abc');
  check('bad id -> 400', r.status === 400);

  ac.abort(); await sse;
  const joined = events.join('');
  check('SSE sent ready + seat events', joined.includes('event: ready') && joined.includes('event: seats') && joined.includes('"held"') && joined.includes('"booked"'), joined.slice(0, 200));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
