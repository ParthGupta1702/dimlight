require('dotenv').config();
const app = require('./app');
const { connectDb } = require('./config/db');
const { startHoldSweeper } = require('./services/holdService');
const { Booking, SeatLock } = require('./models');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDb(); // fail fast if MongoDB is unreachable
    console.log('Connected to MongoDB');
    // make sure the unique seat-lock index exists (this is what prevents double-booking)
    await Promise.all([SeatLock.syncIndexes(), Booking.syncIndexes()]);
    startHoldSweeper();
    app.listen(PORT, () => console.log(`dimlight running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Could not start:', err.message);
    console.error('Is MongoDB running, and is MONGODB_URI in .env correct? Did you run "npm run db:setup"?');
    process.exit(1);
  }
}

start();
