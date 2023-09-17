const LavinMQClientInstance = require('./LavinMQClient');
const pinoLogger = require('./pino/logger');

const DEFAULTS = {
    CONSUME_QUEUE: 'image_generation_webapp',
    SEND_QUEUE: 'job_results_webapp'
};

const ERR_MSGS = {
    CLIENT_NOT_INIT: "LavinMQClient is not initialized or missing.",
    CHANNEL_NOT_INIT: "LavinMQChannel is not initialized.",
    INVALID_CALLBACK: "Invalid callback provided.",
    MISSING_PARAMS: "Missing parameters for sending job results."
};

class LavinMQWorkerQueueHandler {
    constructor(config = {}) {
        if (LavinMQWorkerQueueHandler.instance) {
            return LavinMQWorkerQueueHandler.instance;
        }

        this.lavinMQClient = LavinMQClientInstance;
        this.lavinMQChannel = null;
        this.consumeQueue = config.consumeQueue || DEFAULTS.CONSUME_QUEUE;
        this.sendQueue = config.sendQueue || DEFAULTS.SEND_QUEUE;
        
        LavinMQWorkerQueueHandler.instance = this;
    }

    static getInstance(config = {}) {
        if (!this.instance) {
            this.instance = new LavinMQWorkerQueueHandler(config);
        }
        return this.instance;
    }

    async initialize() {
        if (!this.lavinMQClient) {
            pinoLogger.error(ERR_MSGS.CLIENT_NOT_INIT);
            throw new Error(ERR_MSGS.CLIENT_NOT_INIT);
        }
        
        try {
            await this.lavinMQClient.initializeClient();
            this.lavinMQChannel = await this.lavinMQClient.getChannel();

            if (!this.lavinMQChannel) {
                pinoLogger.error(ERR_MSGS.CHANNEL_NOT_INIT);
                throw new Error(ERR_MSGS.CHANNEL_NOT_INIT);
            }

            await this.setupQueues();
        } catch (error) {
            pinoLogger.error("Failed to initialize LavinMQClient:", error);
            throw error;
        }
    }

    async setupQueues() {
        if (!this.lavinMQChannel) {
            pinoLogger.error(ERR_MSGS.CHANNEL_NOT_INIT);
            throw new Error(ERR_MSGS.CHANNEL_NOT_INIT);
        }

        try {
            await this.lavinMQChannel.assertQueue(this.consumeQueue);
            await this.lavinMQChannel.assertQueue(this.sendQueue);
        } catch (error) {
            pinoLogger.error("Failed to setup queues:", error);
            throw error;
        }
    }

    consumeImageGenerationTasks(callback) {
        if (typeof callback !== 'function') {
            pinoLogger.error(ERR_MSGS.INVALID_CALLBACK);
            throw new Error(ERR_MSGS.INVALID_CALLBACK);
        }

        if (!this.lavinMQChannel) {
            pinoLogger.error(ERR_MSGS.CHANNEL_NOT_INIT);
            throw new Error(ERR_MSGS.CHANNEL_NOT_INIT);
        }

        try {
            this.lavinMQChannel.consume(this.consumeQueue, callback, { noAck: true });
        } catch (error) {
            pinoLogger.error("Failed to consume image generation tasks:", error);
            throw error;
        }
    }

    async sendJobResult(params) {
        if (!params || Object.keys(params).length === 0) {
            pinoLogger.error(ERR_MSGS.MISSING_PARAMS);
            throw new Error(ERR_MSGS.MISSING_PARAMS);
        }

        if (!this.lavinMQChannel) {
            pinoLogger.error(ERR_MSGS.CHANNEL_NOT_INIT);
            throw new Error(ERR_MSGS.CHANNEL_NOT_INIT);
        }

        try {
            const payload = JSON.stringify(params);
            await this.lavinMQChannel.sendToQueue(this.sendQueue, Buffer.from(payload));
            pinoLogger.info("Job result sent successfully.");
        } catch (error) {
            pinoLogger.error("Failed to send job result:", error);
            throw error;
        }
    }

    async close() {
        try {
            await this.lavinMQClient.close();
        } catch (error) {
            pinoLogger.error("Error while closing LavinMQClient:", error);
            throw error;
        }
    }
}

const workerQueueHandler = LavinMQWorkerQueueHandler.getInstance({
    consumeQueue: DEFAULTS.CONSUME_QUEUE,
    sendQueue: DEFAULTS.SEND_QUEUE
});

module.exports = workerQueueHandler;