const mongoose = require('mongoose');

const notificationQueueSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    index: true
  },
  clientName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  month: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  },
  duePayment: {
    type: Number,
    required: true
  },
  email: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  sentAt: {
    type: Date,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
notificationQueueSchema.index({ username: 1, status: 1 });
notificationQueueSchema.index({ username: 1, clientName: 1, type: 1, month: 1 });

module.exports = mongoose.model('NotificationQueue', notificationQueueSchema);
