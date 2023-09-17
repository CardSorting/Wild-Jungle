const logger = require('./pino/status');
const DatabaseHandler = require('./DatabaseHandler');

// Custom error classes
class DatabaseInitializationError extends Error {}
class CriticalDatabaseError extends Error {}

class DatabaseInstance {
    constructor(config) {
        this.dbConfig = config;
    }

    /**
     * Lazily initializes and returns the DatabaseHandler instance.
     */
    initializeDatabaseInstance() {
        if (!this.dbInstance) {
            try {
                this.dbInstance = new DatabaseHandler(this.dbConfig);
                logger.info('DatabaseHandler instance created successfully.');
            } catch (error) {
                logger.error('Failed to initialize DatabaseHandler:', error.message);
                this.notifyCriticalDatabaseError(error);
                throw new DatabaseInitializationError(error.message);
            }
        }
        return this.dbInstance;
    }

    /**
     * Retrieves the singleton instance of DatabaseInstance.
     * If not already created, initializes it with the provided configuration.
     * @param config Database configuration.
     */
    static getInstance(config) {
        if (!DatabaseInstance.instance && config) {
            DatabaseInstance.instance = new DatabaseInstance(config);
        } else if (!DatabaseInstance.instance) {
            throw new Error("DatabaseInstance needs to be initialized with a configuration first.");
        }
        return DatabaseInstance.instance;
    }

    /**
     * Returns the DatabaseHandler instance, initializing if necessary.
     */
    getHandler() {
        return this.initializeDatabaseInstance();
    }

    /**
     * Logs and potentially notifies administrators of critical database errors.
     * @param error Thrown error instance.
     */
    notifyCriticalDatabaseError(error) {
        // This can be integrated with monitoring tools like Sentry, NewRelic, etc.
        // or can be used to send email alerts to the system administrators.
        logger.error(`Critical Database Error: ${error.message}`);
    }
}

// Usage example:
// First-time initialization with config.
// const databaseInstance = DatabaseInstance.getInstance(dbConfig);

// Subsequent retrievals without needing to provide the config again.
// const databaseInstance = DatabaseInstance.getInstance();

module.exports = DatabaseInstance;