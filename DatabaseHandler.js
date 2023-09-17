const Database = require('better-sqlite3');
const logger = require('./pino/status');

class DatabaseHandler {
  constructor(config) {
    if (!this.isValidConfig(config)) {
      throw new Error("Invalid DatabaseHandler configuration provided.");
    }

    this.config = config;
    this.validTables = new Set(this.config.tables.map(this.sanitizeTableName));
    this._initDB();
  }

  isValidConfig(config) {
    return Boolean(config && config.file && Array.isArray(config.tables) && config.createStatement);
  }

  sanitizeTableName(table) {
    return table.replace(/[^\w\s]/gi, '');
  }

  _initDB() {
    if (!this.store) {
      this.store = new Database(this.config.file);

      for (const table of this.config.tables) {
        const sanitizedTable = this.sanitizeTableName(table);
        if (this.validTables.has(sanitizedTable)) {
          const statement = this.config.createStatement.replace('%TABLE_NAME%', sanitizedTable);
          this.store.prepare(statement).run();
          logger.info(`Table ${sanitizedTable} is ready.`);
        } else {
          logger.warn(`Attempted to initialize an unknown table: ${sanitizedTable}`);
        }
      }

      logger.info('SQLite DB initialized successfully.');
    }
  }

  _executeQuery(query, ...params) {
    if (!query) {
      throw new Error('No query provided to execute.');
    }

    try {
      return this.store.prepare(query).run(...params);
    } catch (error) {
      logger.error(`Database query execution error: ${error.message}`);
      throw new Error(`Database error: ${error.message}`);
    }
  }

  getData(userId, tableName) {
    if (!this.validTables.has(tableName) || !userId) {
      logger.warn("Invalid parameters for fetching data.");
      return null;
    }

    try {
      const query = `SELECT * FROM ${tableName} WHERE userId = ?`;
      return this._executeQuery(query, userId).get();
    } catch (error) {
      logger.error(`Error fetching data from table ${tableName} for userId: ${userId}. Error: ${error.message}`);
      return null;
    }
  }

  storeData(data, tableName) {
    if (!this.validTables.has(tableName) || !data || !data.userId || !data.text) {
      logger.warn("Invalid parameters for storing data.");
      return false;
    }

    try {
      const query = `INSERT OR REPLACE INTO ${tableName} (userId, text) VALUES (?, ?)`;
      this._executeQuery(query, data.userId, data.text);
      logger.info(`Data stored for userId: ${data.userId} in ${tableName}.`);
      return true;
    } catch (error) {
      logger.error(`Error storing data in table ${tableName} for userId: ${data.userId}. Error: ${error.message}`);
      return false;
    }
  }

  storeDataWithJobID(data, tableName) {
    if (!this.validTables.has(tableName) || !data || !data.userId || !data.text || !data.jobID) {
      logger.warn("Invalid parameters for storing data.");
      return false;
    }

    try {
      const query = `INSERT OR REPLACE INTO ${tableName} (userId, text, jobID) VALUES (?, ?, ?)`;
      this._executeQuery(query, data.userId, data.text, data.jobID);
      logger.info(`Data stored for userId: ${data.userId} with jobID: ${data.jobID} in ${tableName}.`);
      return true;
    } catch (error) {
      logger.error(`Error storing data in table ${tableName} for userId: ${data.userId} with jobID: ${data.jobID}. Error: ${error.message}`);
      return false;
    }
  }
}

module.exports = DatabaseHandler;