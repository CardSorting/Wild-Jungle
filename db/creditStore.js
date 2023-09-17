const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const logger = require('../pino/credits');

// Custom error class for handling database-related errors
class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class DatabaseHandler {
  constructor() {
    const dbDir = path.join(__dirname, '../sqlite');
    if (!fs.existsSync(dbDir)) {
      logger.info(`Creating database directory at ${dbDir}`);
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'credits.db');
    logger.info(`Initializing SQLite database at ${dbPath}`);
    this.db = new Database(dbPath);
    this.createUserCreditsTable();
  }

  createUserCreditsTable() {
    logger.info(`Ensuring UserCredits table exists`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS UserCredits (
        userID TEXT PRIMARY KEY,
        credits INTEGER NOT NULL CHECK (credits >= 0),
        lastUpdated TEXT
      )
    `);
  }
}

class CreditStore extends DatabaseHandler {
  validateInputs(userID, userCredits) {
    if (typeof userCredits?.credits !== 'number' || isNaN(userCredits?.credits || NaN)) {
      logger.error(`Invalid credits: ${userCredits?.credits}`);
      throw new DatabaseError(`Invalid credits value: ${userCredits?.credits}`);
    }
  }

  async getAllUserIDs() {
    const stmt = this.db.prepare('SELECT userID FROM UserCredits');
    const userIDs = stmt.all();
    return userIDs.map(user => user.userID);
  }

  async retrieveUserCredits(userID) {
    const stmt = this.db.prepare('SELECT credits, lastUpdated FROM UserCredits WHERE userID = ?');
    return stmt.get(userID);
  }

  async updateUserCredits(userID, userCredits) {
    this.validateInputs(userID, userCredits);
    const updateStmt = this.db.prepare('UPDATE UserCredits SET credits = ?, lastUpdated = ? WHERE userID = ?');
    const result = updateStmt.run(userCredits.credits, userCredits.lastUpdated, userID);
    if (result.changes === 0) {
      const insertStmt = this.db.prepare('INSERT INTO UserCredits (userID, credits, lastUpdated) VALUES (?, ?, ?)');
      insertStmt.run(userID, userCredits.credits, userCredits.lastUpdated);
    }
  }

  async deleteUserCredits(userID) {
    this.validateInputs(userID);
    const stmt = this.db.prepare('DELETE FROM UserCredits WHERE userID = ?');
    stmt.run(userID);
  }
}

module.exports = CreditStore;