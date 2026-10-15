// MySQL connection pool (mysql2/promise) shared by every controller.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dimlight',
  waitForConnections: true,
  connectionLimit: 10, // enough for NFR-3 (50 concurrent users) at this scale
});

module.exports = pool;
