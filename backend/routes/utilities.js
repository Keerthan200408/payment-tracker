const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

// Get all payment types
router.get('/get-types', authenticateToken, async (req, res) => {
    try {
        // Ensure MongoDB connection is ready
        if (!mongoose.connection || !mongoose.connection.readyState) {
            throw new Error('MongoDB connection not ready');
        }
        
        // Get distinct types from the payments collection
        const types = await mongoose.connection.db
            .collection('payments')
            .distinct('type');
        
        res.json({ types: types || [] });
    } catch (error) {
        console.error('Error fetching payment types:', error);
        res.status(500).json({ message: 'Error fetching payment types' });
    }
});

module.exports = router;
