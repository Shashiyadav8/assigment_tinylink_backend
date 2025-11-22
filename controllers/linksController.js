// controllers/linksController.js
const db = require('../db');
const { generateCode } = require('../utils/codeGen');
const { checkReachable } = require('../utils/checkReachable');

function isValidUrlAllowHttpHttps(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

module.exports = {
  getAll: async (req, res) => {
    const rows = await db.getAllLinks();
    res.json(rows);
  },

  create: async (req, res) => {
    const { target, code } = req.body;
    if (!target || !isValidUrlAllowHttpHttps(target)) {
      return res.status(400).json({ error: 'Invalid target URL' });
    }

    // Allow skipping the external reachability check in local/test environments
    // Set SKIP_REACHABLE_CHECK=true to skip (e.g., in CI or local dev)
    const skipReachable = process.env.SKIP_REACHABLE_CHECK === 'true';
    if (!skipReachable) {
      try {
        await checkReachable(target, { timeoutMs: 3000, allowPrivate: false });
      } catch (err) {
        return res.status(400).json({ error: 'Target not reachable or not allowed', reason: err.message });
      }
    } else {
      // Helpful debug log when skipping
      console.warn('SKIP_REACHABLE_CHECK=true — skipping external reachability validation for target:', target);
    }

    // duplicate check by target — return 409 (Conflict) if already shortened
    const existing = await db.getLinkByTarget(target);
    if (existing) {
      return res.status(409).json({ error: 'Target URL already shortened', code: existing.code, target: existing.target });
    }

    let finalCode = code;
    if (code) {
      if (!/^[A-Za-z0-9]{6,8}$/.test(code)) {
        return res.status(400).json({ error: 'Code must be 6–8 alphanumeric characters' });
      }
      if (await db.linkExists(code)) {
        return res.status(409).json({ error: 'Code already exists' });
      }
    } else {
      finalCode = await generateCode(6, async (c) => !(await db.linkExists(c)));
    }

    await db.createLink(finalCode, target);
    res.status(201).json({ code: finalCode, target, clicks: 0, lastClicked: null });
  },

  getByCode: async (req, res) => {
    const link = await db.getLinkByCode(req.params.code);
    if (!link) return res.status(404).json({ error: 'Not found' });
    res.json(link);
  },

  removeByCode: async (req, res) => {
    const deleted = await db.deleteLink(req.params.code);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
};
