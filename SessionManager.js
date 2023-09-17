// Custom error class to handle session-related errors
class SessionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SessionError';
    }
}

class SessionManager {
    constructor() {
        this.MAX_ACTIVE_SESSIONS = 3;
        this.activeSessions = new Set();
        this.overflowQueue = [];
    }

    /**
     * Checks if there's capacity for adding more sessions.
     * @returns boolean
     */
    hasCapacity() {
        return this.activeSessions.size < this.MAX_ACTIVE_SESSIONS;
    }

    /**
     * Adds a session to the active sessions set.
     * @param sessionId - The ID of the session to be added.
     */
    addSession(sessionId) {
        if (!sessionId) {
            throw new SessionError("Session ID must be provided.");
        }
        this.activeSessions.add(sessionId);
    }

    /**
     * Removes a session from the active sessions set.
     * @param sessionId - The ID of the session to be removed.
     */
    removeSession(sessionId) {
        if (!sessionId) {
            throw new SessionError("Session ID must be provided.");
        }
        this.activeSessions.delete(sessionId);
    }

    /**
     * Adds a task to the overflow queue.
     * @param task - The task to be added to the queue.
     */
    addToQueue(task) {
        if (!task) {
            throw new SessionError("Task must be provided.");
        }
        this.overflowQueue.push(task);
    }

    /**
     * Retrieves the next task from the overflow queue.
     * @returns The next task or undefined if the queue is empty.
     */
    getNextTask() {
        return this.overflowQueue.shift();
    }

    /**
     * Checks if there are any tasks in the overflow queue.
     * @returns boolean
     */
    hasTasksInQueue() {
        return this.overflowQueue.length > 0;
    }

    // Optional: Encapsulated way to get active sessions count for external uses.
    get activeSessionCount() {
        return this.activeSessions.size;
    }
}

module.exports = SessionManager;