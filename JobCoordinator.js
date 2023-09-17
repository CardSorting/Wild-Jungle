const workerQueueHandler = require('./LavinMQWorkerQueueHandler'); // Check the correct import path
const pinoLogger = require('./pino/logger');

class JobCoordinator {
    constructor(sessionManager, overflowQueueHandler) {
        this.sessionManager = sessionManager;
        this.overflowQueueHandler = overflowQueueHandler;
        this.QUEUE_PROCESS_INTERVAL = 10000; // 10 seconds

        setInterval(() => this.processOverflowQueue(), this.QUEUE_PROCESS_INTERVAL);
    }

    /**
     * Submits a job to the broker. If the broker lacks capacity, the job will be added to an overflow queue.
     * @param text - The text data associated with the job.
     * @param sessionId - The session ID related to the job.
     * @returns A promise resolving with the submission response.
     */
    async submitJobToBroker(text, sessionId) {
        try {
            if (!this.sessionManager.hasCapacity()) {
                this.overflowQueueHandler.addToQueue({ text, sessionId });

                return {
                    status: 'queued',
                    message: 'Job added to the in-memory queue due to max active sessions limit.'
                };
            }

            this.sessionManager.addSession(sessionId);
            const payload = { text, sessionId };
            await workerQueueHandler.sendJobResult(payload);

            return {
                status: 'submitted',
                message: 'Job successfully submitted to the broker.'
            };
        } catch (error) {
            pinoLogger.error("Failed to submit job:", error);
            throw new JobSubmissionError('Failed to submit the job to the broker.');
        }
    }

    /**
     * Processes the overflow queue, and if there's capacity, submits jobs to the broker.
     * This ensures jobs don't get stuck in the overflow queue for too long.
     * @returns A promise indicating the completion of the processing.
     */
    async processOverflowQueue() {
        if (this.sessionManager.hasCapacity() && this.overflowQueueHandler.getQueueLength() > 0) {
            const job = this.overflowQueueHandler.peek();
            const result = await this.submitJobToBroker(job.text, job.sessionId);
            if (result && result.status === 'submitted') {
                this.overflowQueueHandler.shift();
            }
        }
    }
}

class JobSubmissionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'JobSubmissionError';
    }
}

module.exports = JobCoordinator;