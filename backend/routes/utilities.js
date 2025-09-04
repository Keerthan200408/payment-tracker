const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const database = require("../db/mongo");
const { sanitizeType } = require("../utils/sanitize");

/**
 * @desc    Get all payment types for the logged-in user
 * @route   GET /api/utilities/get-types
 */
router.get('/get-types', authenticateToken, asyncHandler(async (req, res) => {
    const username = req.user.username;
    const typesCollection = database.getTypesCollection();
    const userTypesData = await typesCollection.find({ User: username }).toArray();
    const types = userTypesData.map(t => t.Type);
    res.json({ types: types || [] });
}));

/**
 * @desc    Add a new payment type for the logged-in user
 * @route   POST /api/utilities/add-type
 */
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