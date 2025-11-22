// db/index.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------- Database Functions ---------- //

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  query,
  // List all links
  getAllLinks: async () => {
    const result = await query("SELECT code, target, clicks, lastClicked FROM links ORDER BY id DESC");
    return result.rows;
  },

  // Get single link by code
  getLinkByCode: async (code) => {
    const result = await query("SELECT code, target, clicks, lastClicked FROM links WHERE code = $1", [code]);
    return result.rows[0] || null;
  },

  // Get single link by target (to detect duplicates)
  getLinkByTarget: async (target) => {
    const result = await query("SELECT code, target, clicks, lastClicked FROM links WHERE target = $1 LIMIT 1", [target]);
    return result.rows[0] || null;
  },

  // Check if link code exists
  linkExists: async (code) => {
    const result = await query("SELECT 1 FROM links WHERE code = $1 LIMIT 1", [code]);
    return result.rowCount > 0;
  },

  // Create a link
  createLink: async (code, target) => {
    await query("INSERT INTO links (code, target) VALUES ($1, $2)", [code, target]);
    return { code, target, clicks: 0, lastClicked: null };
  },

  // Delete link
  deleteLink: async (code) => {
    const result = await query("DELETE FROM links WHERE code = $1", [code]);
    return result.rowCount > 0;
  },

  // Increment click count + update timestamp
  incrementClick: async (code) => {
    await query("UPDATE links SET clicks = clicks + 1, lastClicked = NOW() WHERE code = $1", [code]);
  },

  // Expose pool if you need to close on shutdown
  pool
};
