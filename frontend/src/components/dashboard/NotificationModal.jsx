import React, { useState, useEffect } from 'react';
import api from '../../api'; // Use our centralized API service

const NotificationModal = ({ isOpen, onClose, queue, setQueue, clearQueueFromDB }) => {
    const [messageTemplate, setMessageTemplate] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendSummary, setSendSummary] = useState(null);

    useEffect(() => {
        // Default template
        if (!messageTemplate) {
            setMessageTemplate(`Dear {clientName},\n\nThis is a payment reminder for your {type} service.\n\n- Month: {month}\n- Amount Paid: ₹{paidAmount}\n- Total Due: ₹{duePayment}\n\nThank you!`);
        }
    }, [messageTemplate]);

    const handleSendAll = async () => {
        setIsSending(true);
        setSendSummary(null);
        let successCount = 0;
        let errorCount = 0;

        for (const notification of queue) {
            const personalizedMessage = messageTemplate
                .replace(/{clientName}/g, notification.clientName)
                .replace(/{type}/g, notification.type)
                .replace(/{month}/g, notification.month.charAt(0).toUpperCase() + notification.month.slice(1))
                .replace(/{paidAmount}/g, notification.value || '0.00')
                .replace(/{duePayment}/g, notification.duePayment || '0.00');

            try {
                // Prioritize WhatsApp, fallback to Email
                if (notification.phone) {
                    await api.messages.sendWhatsApp({ to: notification.phone, message: personalizedMessage });
                } else if (notification.email) {
                    await api.messages.sendEmail({ to: notification.email, subject: `Payment Reminder: ${notification.type}`, html: personalizedMessage.replace(/\n/g, '<br>') });
                }
                successCount++;
            } catch (error) {
                console.error(`Failed to send notification to ${notification.clientName}:`, error);
                errorCount++;
            }
        }
        
        setIsSending(false);
        setSendSummary({ success: successCount, errors: errorCount });
        
        if (successCount > 0) {
            await clearQueueFromDB();
        }
    };

    const handleClose = () => {
        setSendSummary(null);
        onClose();
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-semibold mb-4">Send Notifications ({queue.length} pending)</h2>
                {/* List of notifications, template textarea, and action buttons go here */}
                {/* ... (This is the same JSX you had in HomePage.jsx for the modal) ... */}
                <textarea
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    className="w-full h-40 p-2 border rounded mb-4"
                    disabled={isSending}
                />
                <div className="flex justify-end gap-3">
                    <button onClick={handleClose} disabled={isSending} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={handleSendAll} disabled={isSending || queue.length === 0} className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400">
                        {isSending ? 'Sending...' : `Send All (${queue.length})`}
                    </button>
                </div>
                 {sendSummary && (
                    <p className="mt-4 text-sm text-center">
                        Sent: {sendSummary.success}, Failed: {sendSummary.errors}
                    </p>
                )}
            </div>
        </div>
    );
};

export default NotificationModal;
