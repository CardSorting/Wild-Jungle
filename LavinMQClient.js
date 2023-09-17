const amqp = require('amqplib/callback_api');
const pinoLogger = require('./pino/status');

class LavinMQClient {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    async initialize() {
        try {
            await this.initializeClient();
        } catch (error) {
            pinoLogger.error(`Failed to initialize LavinMQClient: ${error.message}`);
            throw error;
        }
    }

    initializeClient() {
        return new Promise((resolve, reject) => {
            const connectionString = process.env['CLOUDAMQP_URL'];

            if (!connectionString) {
                const error = new Error('CLOUDAMQP_URL not provided.');
                pinoLogger.error(error.message);
                return reject(error);
            }

            pinoLogger.info(`Connecting to LavinMQ at ${connectionString}`);

            amqp.connect(connectionString, (error, connection) => {
                if (error) {
                    pinoLogger.error(`Error occurred with LavinMQ client: ${error.message}`, {
                        stack: error.stack,
                        fullError: error
                    });
                    return reject(error);
                }

                this.connection = connection;

                connection.createChannel((error, channel) => {
                    if (error) {
                        pinoLogger.error(`Error occurred while creating LavinMQ channel: ${error.message}`, {
                            stack: error.stack,
                            fullError: error
                        });
                        connection.close();
                        return reject(error);
                    }

                    this.channel = channel;
                    this.setupEventListeners();
                    resolve();
                });
            });
        });
    }

    setupEventListeners() {
        if (!this.connection || !this.channel) {
            pinoLogger.error('Cannot set up event listeners without a valid connection or channel.');
            return;
        }

        this.connection.on('error', (error) => {
            pinoLogger.error(`Error occurred with LavinMQ connection: ${error.message}`, {
                stack: error.stack,
                fullError: error
            });
        });

        this.connection.on('close', () => {
            pinoLogger.warn('LavinMQ connection closed.');
            this.reconnect();
        });

        this.channel.on('error', (error) => {
            pinoLogger.error(`Error occurred with LavinMQ channel: ${error.message}`, {
                stack: error.stack,
                fullError: error
            });
        });

        this.channel.on('close', () => {
            pinoLogger.warn('LavinMQ channel closed.');
            this.reconnect();
        });
    }

    async reconnect() {
        let retries = 5;
        let delay = 2000;

        while (retries) {
            try {
                await this.initializeClient();
                break;
            } catch (error) {
                retries -= 1;
                delay *= 2;

                if (!retries) {
                    pinoLogger.error('Failed to reconnect after maximum retries.');
                    throw error;
                }

                pinoLogger.info(`Retrying connection in ${delay / 1000} seconds...`);
                await this.delay(delay);
            }
        }
    }

    delay(duration) {
        return new Promise(resolve => setTimeout(resolve, duration));
    }

    getChannel() {
        if (!this.channel) {
            pinoLogger.error('Attempted to get a null channel.');
            throw new Error('Channel is not initialized.');
        }
        return this.channel;
    }

    close() {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                pinoLogger.warn('Attempted to close a null connection.');
                return resolve();
            }

            this.connection.close((err) => {
                if (err) {
                    pinoLogger.error(`Error occurred while closing LavinMQ connection: ${err.message}`);
                    return reject(err);
                }
                resolve();
            });
        });
    }
}

const instance = new LavinMQClient()
module.exports = instance;