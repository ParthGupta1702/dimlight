// npm run db:setup
// Wipes the dimlight database, creates indexes, then seeds: admin, theatres, screens (with seats), movies, showtimes.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDb, mongoose } = require('../src/config/db');
const { Admin, Movie, Theatre, Screen, Showtime, User, Booking, SeatLock } = require('../src/models');
const { addMinutes } = require('../src/utils/time');

const BUFFER_MIN = 15;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const SEATS_PER_ROW = 10;

// [title, genre, language, minutes, description, featured in the home page hero]
const MOVIES = [
  ['Interstellar', 'Sci-Fi', 'English', 169, 'Explorers travel through a wormhole to save humanity.', true],
  ['3 Idiots', 'Comedy', 'Hindi', 170, 'Two friends search for their long-lost college buddy.', false],
  ['The Dark Knight', 'Action', 'English', 152, 'Batman faces the Joker in Gotham City.', true],
  ['Dangal', 'Drama', 'Hindi', 161, 'A father trains his daughters to become wrestlers.', true],
  ['Baahubali 2', 'Action', 'Telugu', 167, 'Why did Kattappa kill Baahubali?', true],
  ['Inside Out', 'Animation', 'English', 95, "The emotions inside a young girl's mind.", false],
];
const THEATRES = [
  ['Dimlight Central', 'Jaipur', ['Screen 1', 'Screen 2']],
  ['Dimlight Mall Road', 'Jaipur', ['Screen 1', 'Screen 2']],
];
const SLOTS = ['10:00', '14:00', '18:30'];
const DAYS_AHEAD = 4;

function seatLayout() {
  const seats = [];
  for (const row of ROWS) for (let number = 1; number <= SEATS_PER_ROW; number++) seats.push({ row, number, label: `${row}${number}` });
  return seats;
}

async function main() {
  await connectDb();
  console.log('Wiping database and creating indexes...');
  await mongoose.connection.dropDatabase();
  await Promise.all([Admin, Movie, Theatre, Screen, Showtime, User, Booking, SeatLock].map((m) => m.syncIndexes()));

  console.log('Seeding admin...');
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dimlight.com').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@12345';
  await Admin.create({ name: 'Dimlight Admin', email: adminEmail, password_hash: await bcrypt.hash(adminPass, 10) });

  console.log('Seeding theatres, screens and seats...');
  const screenIds = [];
  for (const [name, city, screens] of THEATRES) {
    const t = await Theatre.create({ name, city });
    for (const sName of screens) {
      const s = await Screen.create({ theatre: t._id, name: sName, seats: seatLayout() });
      screenIds.push(s._id);
    }
  }

  console.log('Seeding movies...');
  const movies = [];
  for (const [title, genre, language, dur, description, featured] of MOVIES) {
    const poster_url = `https://placehold.co/300x450/1a1a2e/f5c518?text=${encodeURIComponent(title)}`;
    const m = await Movie.create({ title, genre, language, duration_min: dur, poster_url, description, featured });
    movies.push({ id: m._id, dur });
  }

  console.log('Seeding showtimes (no overlaps)...');
  const busy = {}; // screenId -> [[startMs, endMs]]
  const today = new Date();
  const docs = [];
  for (let d = 0; d < DAYS_AHEAD; d++) {
    const date = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + d)).toISOString().slice(0, 10);
    for (let mi = 0; mi < movies.length; mi++) {
      for (let si = 0; si < SLOTS.length; si++) {
        const start = new Date(`${date}T${SLOTS[si]}:00Z`);
        const end = addMinutes(start, movies[mi].dur + BUFFER_MIN);
        for (let k = 0; k < screenIds.length; k++) { // find a screen that is free for this window
          const sid = screenIds[(mi + si + k) % screenIds.length];
          const list = (busy[String(sid)] = busy[String(sid)] || []);
          if (list.some(([a, b]) => start < b && end > a)) continue;
          list.push([start.getTime(), end.getTime()]);
          docs.push({ movie: movies[mi].id, screen: sid, start_at: start, end_at: end, price: SLOTS[si] === '18:30' ? 300 : 220 });
          break;
        }
      }
    }
  }
  await Showtime.insertMany(docs);

  console.log(`Done. ${docs.length} showtimes created.`);
  console.log(`Admin login: ${adminEmail} / ${adminPass}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Setup failed:', e.message);
  process.exit(1);
});
