// routes/links.js
const express = require('express');
const router = express.Router();
const linksController = require('../controllers/linksController');
const asyncHandler = require('../middleware/asyncHandler');

// GET /api/links
router.get('/', asyncHandler(linksController.getAll));

// POST /api/links
router.post('/', asyncHandler(linksController.create));

// GET /api/links/:code
router.get('/:code', asyncHandler(linksController.getByCode));

// DELETE /api/links/:code
router.delete('/:code', asyncHandler(linksController.removeByCode));

module.exports = router;
