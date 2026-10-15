require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await pool.query('SELECT 1'); // fail fast if MySQL is unreachable
    console.log('Connected to MySQL');
    app.listen(PORT, () => console.log(`dimlight API running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Could not connect to MySQL:', err.message);
    process.exit(1);
  }
}

start();
