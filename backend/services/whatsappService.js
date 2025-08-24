const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.qrCodeGenerated = false;
  }

  async initialize() {
    if (this.client) {
      return this.client;
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "payment-tracker-client"
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      }
    });

    // QR Code generation
    this.client.on('qr', (qr) => {
      console.log('WhatsApp QR Code generated. Scan this QR code with your phone:');
      qrcode.generate(qr, { small: true });
      this.qrCodeGenerated = true;
    });

    // Client ready
    this.client.on('ready', () => {
      console.log('WhatsApp client is ready!');
      this.isReady = true;
    });

    // Authentication success
    this.client.on('authenticated', () => {
      console.log('WhatsApp authenticated successfully');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      console.error('WhatsApp authentication failed:', msg);
    });

    // Client disconnected
    this.client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      this.isReady = false;
    });

    // Initialize the client
    await this.client.initialize();
    
    return this.client;
  }

  async sendMessage(to, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready. Please scan the QR code first.');
    }

    try {
      // Format phone number (remove any non-digits and add country code if needed)
      let phoneNumber = to.replace(/\D/g, '');
      
      // Add India country code if not present and number is 10 digits
      if (phoneNumber.length === 10) {
        phoneNumber = '91' + phoneNumber;
      }
      
      // Add @c.us suffix for WhatsApp
      const chatId = phoneNumber + '@c.us';
      
      console.log(`Sending WhatsApp message to ${chatId}`);
      
      const result = await this.client.sendMessage(chatId, message);
      
      return {
        success: true,
        messageId: result.id.id,
        timestamp: result.timestamp,
        to: chatId
      };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  async getStatus() {
    return {
      isReady: this.isReady,
      qrCodeGenerated: this.qrCodeGenerated,
      clientState: this.client ? await this.client.getState() : 'NOT_INITIALIZED'
    };
  }

  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
      this.qrCodeGenerated = false;
    }
  }
}

// Create singleton instance
const whatsappService = new WhatsAppService();

module.exports = whatsappService;
