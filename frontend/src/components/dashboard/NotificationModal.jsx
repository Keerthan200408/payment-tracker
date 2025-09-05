import React, { useState, useEffect } from 'react';
import api from '../../api';

// normalize contact fields across variants
const pickFirst = (...cands) => {
  for (const v of cands) {
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
};
const getPhone = (n) =>
  pickFirst(n.phone, n.Phone, n.Phone_Number, n['Phone Number'], n.whatsapp, n.WhatsApp, n.contactPhone);
const getEmail = (n) =>
  pickFirst(n.email, n.Email, n['E-mail'], n.Email_Address, n.Mail, n.contactEmail);

const NotificationModal = ({ isOpen, onClose, queue, setQueue, clearQueueFromDB }) => {
  const [messageTemplate, setMessageTemplate] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);

  useEffect(() => {
    if (!messageTemplate) {
      setMessageTemplate(
        `Dear {clientName},

This is a payment reminder for your {type} service.

- Month: {month}
- Amount Paid: ₹{paidAmount}
- Total Due: ₹{duePayment}

Thank you!`
      );
    }
  }, [messageTemplate]);

  const toMoney = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  };

  const handleRemove = (id) => {
    setQueue((prev) => prev.filter((n) => n.id !== id));
  };

  const handleSendAll = async () => {
    if (!queue?.length) return;
    setIsSending(true);
    setSendSummary(null);

    let successCount = 0;
    let errorCount = 0;

    for (const n of queue) {
      const phone = getPhone(n);
      const email = getEmail(n);

      const personalizedMessage = messageTemplate
        .replace(/{clientName}/g, n.clientName ?? '')
        .replace(/{type}/g, n.type ?? '')
        .replace(/{month}/g, n.month ? n.month.charAt(0).toUpperCase() + n.month.slice(1) : '')
        .replace(/{paidAmount}/g, toMoney(n.value))
        .replace(/{duePayment}/g, toMoney(n.duePayment));

      try {
        if (phone) {
          await api.messages.sendWhatsApp({ to: phone, message: personalizedMessage });
        } else if (email) {
          await api.messages.sendEmail({
            to: email,
            subject: `Payment Reminder: ${n.type ?? ''}`,
            html: personalizedMessage.replace(/\n/g, '<br>'),
          });
        } else {
          errorCount++; // no contact info
          continue;
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to send notification to ${n.clientName}:`, err);
        errorCount++;
      }
    }

    setIsSending(false);
    setSendSummary({ success: successCount, errors: errorCount });

    if (successCount > 0 && typeof clearQueueFromDB === 'function') {
      try {
        await clearQueueFromDB();
        setQueue([]);
      } catch (e) {
        console.error('Failed to clear queue from DB:', e);
      }
    }
  };

  const handleClose = () => {
    setSendSummary(null);
    onClose?.();
  };

  if (!isOpen) return null;
  const count = queue?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Send Notifications ({count} pending)</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700" disabled={isSending} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mb-4 border rounded">
          <div className="px-3 py-2 bg-gray-50 border-b text-sm text-gray-700">Recipients</div>
          {count === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">No recipients in the queue.</div>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y">
              {queue.map((n) => {
                const phone = getPhone(n);
                const email = getEmail(n);
                return (
                  <li key={n.id} className="px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{n.clientName || '-'} • {n.type || '-'}</div>
                        <div className="text-gray-600">
                          Month: {n.month ? n.month.charAt(0).toUpperCase() + n.month.slice(1) : '-'} • Paid: ₹{toMoney(n.value)} • Due: ₹{toMoney(n.duePayment)}
                        </div>
                        <div className="text-gray-500">
                          {phone ? `WhatsApp: ${phone}` : (email ? `Email: ${email}` : 'No contact info')}
                        </div>
                      </div>
                      <button
                        className="shrink-0 px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                        onClick={() => handleRemove(n.id)}
                        disabled={isSending}
                        aria-label={`Remove ${n.clientName || 'recipient'}`}
                        title="Remove from queue"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Message template
          <span className="ml-1 text-xs text-gray-500">(variables: {'{clientName}'}, {'{type}'}, {'{month}'}, {'{paidAmount}'}, {'{duePayment}'})</span>
        </label>
        <textarea
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          className="w-full h-40 p-2 border rounded mb-4 font-mono text-sm"
          disabled={isSending}
        />

        <div className="flex justify-between items-center">
          <div className="text-xs text-gray-500">Tip: Use new lines in the template; we convert to HTML for email automatically.</div>
          <div className="flex gap-3">
            <button onClick={handleClose} disabled={isSending} className="px-4 py-2 border rounded">Cancel</button>
            <button onClick={handleSendAll} disabled={isSending || count === 0} className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400">
              {isSending ? 'Sending...' : `Send All (${count})`}
            </button>
          </div>
        </div>

        {sendSummary && (
          <p className="mt-4 text-sm text-center">Sent: {sendSummary.success}, Failed: {sendSummary.errors}</p>
        )}
      </div>
    </div>
  );
};

export default NotificationModal;