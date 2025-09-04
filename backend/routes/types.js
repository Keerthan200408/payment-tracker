const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const database = require("../db/mongo");
const { sanitizeType } = require("../utils/sanitize");

// NOTE: This is the same logic from utilities.js, moved to the correct file.
router.post('/add-type', authenticateToken, asyncHandler(async (req, res) => {
    const { type } = req.body;
    const username = req.user.username;

    const sanitizedType = sanitizeType(type);
    if (!sanitizedType) {
        throw new ValidationError("Type name is invalid or empty.");
    }

    const typesCollection = database.getTypesCollection();
    const existingType = await typesCollection.findOne({ User: username, Type: sanitizedType });

    if (existingType) {
        throw new ValidationError(`Type "${sanitizedType}" already exists.`);
    }

    await typesCollection.insertOne({ User: username, Type: sanitizedType });
    res.status(201).json({ message: "Type added successfully", type: sanitizedType });
}));

module.exports = router;