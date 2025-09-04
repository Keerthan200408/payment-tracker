const axios = require('axios');
const config = require('../config');
const { retryWithBackoff } = require('./retryWithBackoff');

/**
 * Formats a phone number into the required E.164 format for the API.
 * @param {string} phone - The phone number to format.
 * @returns {string} - The formatted phone number (e.g., +919876543210).
 */
const formatPhoneNumber = (phone) => {
    let formatted = phone.trim().replace(/[\s-]/g, "");
    if (!formatted.startsWith("+")) {
        // Assuming Indian numbers if no country code is provided
        formatted = `+91${formatted.replace(/\D/g, "")}`;
    }
    return formatted;
};

/**
 * Sends a WhatsApp message using the UltraMsg API.
 * @param {string} to - The recipient's phone number.
 * @param {string} message - The message body to send.
 * @returns {Promise<Object>} - The API response data.
 */
const sendWhatsApp = async (to, message) => {
    if (!config.ULTRAMSG_TOKEN || !config.ULTRAMSG_INSTANCE_ID) {
        throw new Error("Server configuration error: Missing WhatsApp API credentials.");
    }

    const formattedPhone = formatPhoneNumber(to);
    const payload = new URLSearchParams({
        token: config.ULTRAMSG_TOKEN,
        to: formattedPhone,
        body: message,
    }).toString();

    const apiCall = () => axios.post(
        `${config.API.ULTRA_MSG_BASE_URL}/${config.ULTRAMSG_INSTANCE_ID}/messages/chat`,
        payload,
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: config.API.TIMEOUT,
        }
    );

    const response = await retryWithBackoff(apiCall);

    if (response.status === 200 && (response.data.sent === "true" || response.data.messageId)) {
        return response.data;
    } else {
        throw new Error(`Unexpected response from WhatsApp API: ${JSON.stringify(response.data)}`);
    }
};

/**
 * Verifies if a contact is valid on WhatsApp.
 * @param {string} phone - The phone number to verify.
 * @returns {Promise<Object>} - The verification result.
 */
const verifyContact = async (phone) => {
    if (!config.ULTRAMSG_TOKEN || !config.ULTRAMSG_INSTANCE_ID) {
        throw new Error("Server configuration error: Missing WhatsApp API credentials.");
    }

    const formattedPhone = formatPhoneNumber(phone);
    const chatId = `${formattedPhone}@c.us`;

    const apiCall = () => axios.get(
        `${config.API.ULTRA_MSG_BASE_URL}/${config.ULTRAMSG_INSTANCE_ID}/contacts/check`,
        {
            params: { token: config.ULTRAMSG_TOKEN, chatId },
            timeout: config.API.TIMEOUT,
        }
    );

    const response = await retryWithBackoff(apiCall);
    return { isValidWhatsApp: response.data.status === "valid" };
};

module.exports = {
    sendWhatsApp,
    verifyContact,
};