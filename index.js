require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const CreditManager = require('./CreditManager');
const SessionManager = require('./SessionManager');
const OverflowQueueHandler = require('./OverflowQueueHandler');
const JobCoordinator = require('./JobCoordinator');
const LavinMQWorkerQueueHandler = require('./LavinMQWorkerQueueHandler');
const dbInstance = require('./databaseInstance');

const app = express();
const sseClients = new Map();

// CORS Options
const corsOptions = {
    origin: process.env.ALLOWED_ORIGIN || 'https://graygiganticopendoc.0xjzy.repl.co',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    optionsSuccessStatus: 204
};

const creditManager = new CreditManager();
const concurrency = 3;
const sessionManager = new SessionManager();

// Winston Logger Setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

async function initializeApp() {
    try {
        const overflowQueue = await OverflowQueueHandler.initialize(workerFunction, concurrency);
        const jobCoordinator = new JobCoordinator(sessionManager, overflowQueue);
        await LavinMQWorkerQueueHandler.initialize();

        app.use(helmet());
        app.use(cors(corsOptions));
        app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
        app.use(express.json());

        app.get('/listen-for-results/:jobID', streamResultsEndpoint);
        LavinMQWorkerQueueHandler.consumeImageGenerationTasks(consumeImageTasks);
        app.post('/submit-to-broker', submitToBrokerEndpoint);

        app.use(errorHandler);

        const PORT = Number(process.env.PORT) || 3001;
        app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
        });

        // Debugging to verify the correct ALLOWED_ORIGIN
        console.log("ALLOWED_ORIGIN:", process.env.ALLOWED_ORIGIN);
    } catch (error) {
        logger.error("Failed to initialize the application:", error);
    }
}

function streamResultsEndpoint(req, res) {
    const jobID = req.params.jobID;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.set(jobID, res);
    req.on('close', () => {
        sseClients.delete(jobID);
    });
}

function consumeImageTasks(msg) {
    try {
        const data = JSON.parse(msg.content.toString());
        if (data.cdnLink && data.userId && data.jobID) {
            const tableName = "UserPrompts";
            const success = dbInstance.getHandler().storeData(data.userId, null, data.cdnLink, tableName);
            if (!success) {
                logger.error('Failed to update cdnLink in database.');
            }
            const clientRes = sseClients.get(data.jobID);
            if (clientRes) {
                clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
                sseClients.delete(data.jobID);
                clientRes.end();
            }
        }
    } catch (error) {
        logger.error("Error processing cdnLink update from MQ:", error);
    }
}

async function submitToBrokerEndpoint(req, res, next) {
    try {
        const { text, userId } = req.body;
        if (!text || !userId) {
            return res.status(400).json({ error: 'Text and UserId are required.' });
        }

        const jobID = uuidv4();
        const storeSuccess = dbInstance.getHandler().storeDataWithJobID(userId, text, jobID);
        if (!storeSuccess) {
            throw new Error('Failed to store data.');
        }

        const sessionId = req.headers['x-session-id'];
        const result = await jobCoordinator.submitJobToBroker(text, sessionId, jobID);
        const renderCost = text.length;
        const isDeducted = await creditManager.handleRenderCostDeduction(userId, renderCost);
        if (!isDeducted) {
            return res.status(400).json({ error: 'Insufficient credits for the user.' });
        }

        res.status(200).json({ message: result.message, jobID });
    } catch (error) {
        next(error);
    }
}

function errorHandler(err, req, res, next) {
    logger.error(err.stack);
    res.status(500).json({ error: 'Something broke on the server.' });
}

initializeApp().catch(error => {
    logger.error("Failed to initialize the application:", error);
});