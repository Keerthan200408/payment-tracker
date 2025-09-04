const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const database = require("../db/mongo");

/**
 * @desc    Get all payment types for the logged-in user
 * @route   GET /api/utilities/get-types
 */
router.get('/get-types', authenticateToken, asyncHandler(async (req, res) => {
    // Get the username from the token, which was added by the authenticateToken middleware
    const username = req.user.username;

    // Get the types from the 'types' collection, which is the correct source
    const typesCollection = database.getTypesCollection();
    const userTypesData = await typesCollection.find({ User: username }).toArray();
    
    // Extract just the type names from the documents
    const types = userTypesData.map(t => t.Type);

    res.json({ types: types || [] });
}));

module.exports = router;