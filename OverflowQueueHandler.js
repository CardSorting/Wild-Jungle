const { logger: pinoLogger } = require('./pino/logger.js');

// Use a Singleton pattern to ensure that the PQueue is only imported once.
let PQueueInstance;

class OverflowQueueHandler {
  
  constructor(options) {
    if (!PQueueInstance) {
      throw new Error("OverflowQueueHandler hasn't been initialized. Ensure you call the `initialize` method before creating instances.");
    }

    const { worker, concurrency } = options;

    if (typeof worker !== 'function') {
      throw new TypeError("Worker must be a function");
    }

    if (typeof concurrency !== 'number' || concurrency <= 0) {
      throw new TypeError("Concurrency must be a positive number");
    }

    this.worker = worker;
    this.queue = new PQueueInstance({ concurrency });

    // Register listeners for logging
    this.queue.on('add', () => {
      pinoLogger.info("Task added to the queue.");
    });

    this.queue.on('next', () => {
      pinoLogger.info("Task completed.");
    });
  }

  async addToQueue(item) {
    if (!item) {
      const errorMessage = "Failed to add task to overflow queue: Missing task data.";
      pinoLogger.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      await this.queue.add(() => this.worker(item));
      pinoLogger.info("Task added and will be processed.");
    } catch (error) {
      pinoLogger.error(`Error processing task: ${error.message}`);
      throw error; // Rethrow to handle it upstream if necessary.
    }
  }

  getQueueLength() {
    return this.queue.size + this.queue.pending;  // sum of pending and queued tasks
  }

  async drain() {
    await this.queue.onEmpty();
    pinoLogger.info("All items in the overflow queue have been processed.");
  }

  // Static method to asynchronously initialize the module.
  static async initialize() {
    if (!PQueueInstance) {
      PQueueInstance = (await import('p-queue')).default;
      pinoLogger.info("Successfully initialized OverflowQueueHandler.");
    } else {
      pinoLogger.warn("OverflowQueueHandler was already initialized.");
    }
  }
}

module.exports = OverflowQueueHandler;