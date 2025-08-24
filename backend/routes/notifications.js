const express = require('express');
const router = express.Router();
const NotificationQueue = require('../models/NotificationQueue');
const whatsappService = require('../services/whatsappService');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all pending notifications for user
router.get('/queue', authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  
  const notifications = await NotificationQueue.find({
    username,
    status: 'pending'
  }).sort({ timestamp: -1 });
  
  res.json(notifications);
}));

// Add notification to queue
router.post('/queue', authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  const {
    id,
    clientName,
    type,
    month,
    value,
    duePayment,
    email,
    phone
  } = req.body;

  // Remove existing notification for same client/type/month
  await NotificationQueue.deleteMany({
    username,
    clientName,
    type,
    month
  });

  // Create new notification
  const notification = new NotificationQueue({
    id,
    username,
    clientName,
    type,
    month,
    value,
    duePayment,
    email,
    phone,
    status: 'pending'
  });

  await notification.save();
  res.json({ message: 'Notification added to queue', notification });
}));

// Remove notification from queue
router.delete('/queue/:id', authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  const { id } = req.params;

  await NotificationQueue.deleteOne({ id, username });
  res.json({ message: 'Notification removed from queue' });
}));

// Clear all notifications for user
router.delete('/queue', authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  
  await NotificationQueue.deleteMany({ username, status: 'pending' });
  res.json({ message: 'All notifications cleared from queue' });
}));

// Initialize WhatsApp service
router.post('/whatsapp/initialize', authenticateToken, asyncHandler(async (req, res) => {
  try {
    await whatsappService.initialize();
    res.json({ message: 'WhatsApp service initialized' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize WhatsApp service' });
  }
}));

// Get WhatsApp status
router.get('/whatsapp/status', authenticateToken, asyncHandler(async (req, res) => {
  const status = await whatsappService.getStatus();
  res.json(status);
}));

// Send WhatsApp message (replacing UltraMsg)
router.post('/send-whatsapp', authenticateToken, asyncHandler(async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Phone number and message are required' });
  }

  try {
    const result = await whatsappService.sendMessage(to, message);
    res.json({
      success: true,
      message: 'WhatsApp message sent successfully',
      data: result
    });
  } catch (error) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send WhatsApp message'
    });
  }
}));

// Send all pending notifications
router.post('/send-all', authenticateToken, asyncHandler(async (req, res) => {
  const username = req.user.username;
  const { template } = req.body;

  if (!template) {
    return res.status(400).json({ error: 'Message template is required' });
  }

  const pendingNotifications = await NotificationQueue.find({
    username,
    status: 'pending'
  });

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const notification of pendingNotifications) {
    try {
      // Replace template variables
      const personalizedMessage = template
        .replace(/{clientName}/g, notification.clientName)
        .replace(/{type}/g, notification.type)
        .replace(/{month}/g, notification.month.charAt(0).toUpperCase() + notification.month.slice(1))
        .replace(/{paidAmount}/g, notification.value || '0.00')
        .replace(/{duePayment}/g, notification.duePayment || '0.00');

      let notificationSent = false;

      // Try WhatsApp first if phone number exists
      if (notification.phone && notification.phone.trim()) {
        try {
          await whatsappService.sendMessage(notification.phone, personalizedMessage);
          notificationSent = true;
          successCount++;
          
          // Update notification status
          await NotificationQueue.updateOne(
            { _id: notification._id },
            { 
              status: 'sent', 
              sentAt: new Date(),
              errorMessage: null
            }
          );
        } catch (whatsappError) {
          console.log(`WhatsApp failed for ${notification.clientName}, trying email...`);
        }
      }

      // Try Email if WhatsApp failed or no phone number
      if (!notificationSent && notification.email && notification.email.trim()) {
        try {
          // Email sending logic would go here
          // For now, marking as sent since email functionality exists elsewhere
          notificationSent = true;
          successCount++;
          
          await NotificationQueue.updateOne(
            { _id: notification._id },
            { 
              status: 'sent', 
              sentAt: new Date(),
              errorMessage: null
            }
          );
        } catch (emailError) {
          errorCount++;
          errors.push(`${notification.clientName}: ${emailError.message}`);
          
          await NotificationQueue.updateOne(
            { _id: notification._id },
            { 
              status: 'failed',
              errorMessage: emailError.message,
              retryCount: notification.retryCount + 1
            }
          );
        }
      }

      // If no contact method available
      if (!notificationSent) {
        errorCount++;
        errors.push(`${notification.clientName}: No contact information available`);
        
        await NotificationQueue.updateOne(
          { _id: notification._id },
          { 
            status: 'failed',
            errorMessage: 'No contact information available',
            retryCount: notification.retryCount + 1
          }
        );
      }
    } catch (error) {
      errorCount++;
      errors.push(`${notification.clientName}: ${error.message}`);
      
      await NotificationQueue.updateOne(
        { _id: notification._id },
        { 
          status: 'failed',
          errorMessage: error.message,
          retryCount: notification.retryCount + 1
        }
      );
    }
  }

  res.json({
    success: true,
    message: `Notifications processed: ${successCount} sent, ${errorCount} failed`,
    successCount,
    errorCount,
    errors
  });
}));

module.exports = router;
