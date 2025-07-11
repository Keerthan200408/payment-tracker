const { MongoClient } = require("mongodb");
const config = require("../config");

class Database {
  constructor() {
    this.client = new MongoClient(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    this.db = null;
  }

  async connect() {
    try {
      if (!this.client.topology || !this.client.topology.isConnected()) {
        await this.client.connect();
        this.db = this.client.db("payment_tracker");
        console.log("Connected to MongoDB");
      }
      return this.db;
    } catch (error) {
      console.error("MongoDB connection error:", error.message);
      throw error;
    }
  }

  async getDb() {
    if (!this.db) {
      await this.connect();
    }
    return this.db;
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log("MongoDB connection closed");
    }
  }

  // Collection helpers
  getUsersCollection() {
    return this.db.collection("users");
  }

  getTypesCollection() {
    return this.db.collection("types");
  }

  getClientsCollection(username) {
    return this.db.collection(`clients_${username}`);
  }

  getPaymentsCollection(username) {
    return this.db.collection(`payments_${username}`);
  }

  // Transaction wrapper
  async withTransaction(callback) {
    const session = this.client.startSession();
    try {
      await session.withTransaction(callback);
    } finally {
      await session.endSession();
    }
  }

  // Health check
  async healthCheck() {
    try {
      await this.getDb();
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

// Singleton instance
const database = new Database();

module.exports = database;
