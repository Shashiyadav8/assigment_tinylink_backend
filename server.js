// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Initialize app FIRST
const app = express();

// ---------- CORS setup ----------
// Default allowed origins (deployed frontend + localhost dev)
const DEFAULT_ALLOWED = [
  'https://assignment-tinylink-frontend.onrender.com',
  'http://localhost:3000'
];

// If ALLOWED_ORIGINS env var is provided, it should be a comma-separated list:
// ALLOWED_ORIGINS="https://foo.com,http://localhost:3000"
const allowedFromEnv = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...DEFAULT_ALLOWED, ...allowedFromEnv]));

// CORS middleware: allow whitelisted origins, allow requests with no Origin (curl/Postman)
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (e.g., curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS policy does not allow access from the specified Origin'), false);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ---------- Middlewares ----------
app.use(express.json());
app.use(morgan('tiny'));

// ---------- Routes ----------
app.use('/api/links', require('./routes/links'));

// HEALTH CHECK — must be AFTER CORS middleware
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    db: process.env.DATABASE_URL ? 'connected' : 'missing'
  });
});

// ---------- Redirect short code ----------
const db = require('./db');

app.get('/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const link = await db.getLinkByCode(code);

    if (!link) return res.status(404).send('Not found');

    await db.incrementClick(code);
    return res.redirect(302, link.target);

  } catch (err) {
    console.error('Redirect error:', err);
    res.status(500).send('Internal server error');
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
