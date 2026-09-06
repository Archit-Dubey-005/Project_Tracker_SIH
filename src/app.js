const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const db = require('./config/db'); // ensures schema exists on boot

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const authRoute = require('./routes/auth');
const logRoute = require('./routes/log');
const ingestRoute = require('./routes/ingest');
const reviewRoute = require('./routes/review');
const scheduleRoute = require('./routes/schedule');
const dashboardRoute = require('./routes/dashboard');

// Support both /api/* and direct routes for maximum Vercel rewrite compatibility
app.use(['/api/auth', '/auth'], authRoute);
app.use(['/api/log', '/log'], logRoute);
app.use(['/api/ingest', '/ingest'], ingestRoute);
app.use(['/api/review', '/review'], reviewRoute);
app.use(['/api/schedule', '/schedule'], scheduleRoute);
app.use(['/api/dashboard', '/dashboard'], dashboardRoute);

app.get(['/health', '/api/health'], async (req, res) => {
  try {
    const status = await db.checkDbStatus();
    res.status(status.ok ? 200 : 500).json(status);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[App Error]', err);
  let userMessage = err.message || 'Internal server error';

  if (err.code === 'ER_NO_SUCH_TABLE') {
    userMessage = `Database Error: Table '${err.sqlMessage || 'users'}' was not found. Please verify the database name in DATABASE_URL.`;
  } else if (err.code === 'ECONNREFUSED') {
    userMessage = `Database Connection Refused: Could not connect to MySQL server. Ensure DATABASE_URL is set in Vercel Environment Variables.`;
  } else if (err.code === 'ENOTFOUND' && String(err.message).includes('railway.internal')) {
    userMessage = `Configuration Error: Cannot resolve 'mysql.railway.internal' outside Railway. Change DATABASE_URL in Vercel to Railway's Public TCP Proxy URL.`;
  } else if (err.code === 'ETIMEDOUT') {
    userMessage = `Database Timeout: Connection to MySQL proxy timed out. Please check Railway status.`;
  }

  res.status(500).json({ error: userMessage, code: err.code });
});

module.exports = app;
