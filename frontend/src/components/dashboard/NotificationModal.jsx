import React, { useState, useEffect, useMemo } from 'react';
import api from '../../api';

/* --------------------- helpers: normalization + formatting --------------------- */
const pickFirst = (...cands) => {
  for (const v of cands) {
    if (v !== undefined && v !== null) {
      const s = String(v).trim?.() ?? String(v);
      if (s) return s;
    }
  }
  return null;
};

const normPhoneFromObj = (o) =>
  pickFirst(
    o?.phone, o?.Phone, o?.Phone_Number, o?.['Phone Number'],
    o?.whatsapp, o?.WhatsApp, o?.contactPhone,
    o?.Mobile, o?.Mobile_Number, o?.['Mobile Number'],
    o?.contact_number, o?.Contact
  );

const normEmailFromObj = (o) =>
  pickFirst(
    o?.email, o?.Email, o?.['E-mail'],
    o?.Email_Address, o?.['Email Address'],
    o?.Mail, o?.contactEmail
  );

const money = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};
/* ----------------------------------------------------------------------------- */

const NotificationModal = ({ isOpen, onClose, queue, setQueue, clearQueueFromDB, paymentsData }) => {
  const [messageTemplate, setMessageTemplate] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);

  // default template once
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

  // Build a contacts index from current table to enrich legacy queue items:
  // key: `${Client_Name}|${Type}` -> { phone, email }
  const contactsIndex = useMemo(() => {
    const idx = {};
    (paymentsData || []).forEach((r) => {
      const key = `${r?.Client_Name ?? ''}|${r?.Type ?? ''}`;
      if (!key.trim()) return;
      const email = normEmailFromObj(r);
      const phone = normPhoneFromObj(r);
      if (email || phone) idx[key] = { email, phone };
    });
    return idx;
  }, [paymentsData]);

  const removeFromQueue = (id) => {
    setQueue((prev) => prev.filter((n) => n.id !== id));
  };

  const sendAll = async () => {
    if (!queue?.length) return;
    setIsSending(true);
    setSendSummary(null);

    let ok = 0, fail = 0;

    for (const n of queue) {
      // prefer explicit fields on the queue item; fallback to contactsIndex
      const idxKey = `${n?.clientName ?? ''}|${n?.type ?? ''}`;
      const idxHit = contactsIndex[idxKey] || {};
      const phone = pickFirst(normPhoneFromObj(n), idxHit.phone);
      const email = pickFirst(normEmailFromObj(n), idxHit.email);

      const monthLabel = n?.month ? n.month.charAt(0).toUpperCase() + n.month.slice(1) : '';

      const msg = (messageTemplate || '')
        .replace(/{clientName}/g, n.clientName ?? '')
        .replace(/{type}/g, n.type ?? '')
        .replace(/{month}/g, monthLabel)
        .replace(/{paidAmount}/g, money(n.value))
        .replace(/{duePayment}/g, money(n.duePayment));

      try {
        if (phone) {
          await api.messages.sendWhatsApp({ to: phone, message: msg });
          ok++;
        } else if (email) {
          await api.messages.sendEmail({
            to: email,
            subject: `Payment Reminder: ${n.type ?? ''}`,
            html: msg.replace(/\n/g, '<br>'),
          });
          ok++;
        } else {
          fail++; // nothing to send to
        }
      } catch (e) {
        console.error(`Failed to send to ${n.clientName}:`, e);
        fail++;
      }
    }

    setIsSending(false);
    setSendSummary({ success: ok, errors: fail });

    if (ok > 0 && typeof clearQueueFromDB === 'function') {
      try {
        await clearQueueFromDB();
        setQueue([]); // local reflect
      } catch (e) {
        console.error('Failed to clear queue from DB:', e);
      }
    }
  };

  const close = () => {
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
          <button onClick={close} className="text-gray-500 hover:text-gray-700" disabled={isSending} aria-label="Close">✕</button>
        </div>

        {/* recipients */}
        <div className="mb-4 border rounded">
          <div className="px-3 py-2 bg-gray-50 border-b text-sm text-gray-700">Recipients</div>
          {count === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">No recipients in the queue.</div>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y">
              {queue.map((n) => {
                const idxKey = `${n?.clientName ?? ''}|${n?.type ?? ''}`;
                const idxHit = contactsIndex[idxKey] || {};
                const phone = pickFirst(normPhoneFromObj(n), idxHit.phone);
                const email = pickFirst(normEmailFromObj(n), idxHit.email);
                const monthLabel = n?.month ? n.month.charAt(0).toUpperCase() + n.month.slice(1) : '-';

                return (
                  <li key={n.id} className="px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{n.clientName || '-'} • {n.type || '-'}</div>
                        <div className="text-gray-600">
                          Month: {monthLabel} • Paid: ₹{money(n.value)} • Due: ₹{money(n.duePayment)}
                        </div>
                        <div className="text-gray-500">
                          {phone ? `WhatsApp: ${phone}` : 'WhatsApp: —'} {' '}
                          {email ? `• Email: ${email}` : '• Email: —'}
                        </div>
                      </div>
                      <button
                        className="shrink-0 px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                        onClick={() => removeFromQueue(n.id)}
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

        {/* template */}
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

        {/* actions */}
        <div className="flex justify-between items-center">
          <div className="text-xs text-gray-500">Tip: Use new lines; we convert to HTML for email automatically.</div>
          <div className="flex gap-3">
            <button onClick={close} disabled={isSending} className="px-4 py-2 border rounded">Cancel</button>
            <button onClick={sendAll} disabled={isSending || count === 0} className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400">
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
