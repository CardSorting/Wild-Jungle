const CreditStore = require('./db/creditStore');  // This should point to the location of your CreditStore definitions.
const creditslog = require('./pino/credits');

class CreditManager {
  constructor(config = {}, creditStore = new (require('./db/creditStore'))()) {
    this.config = config;
    this.DEFAULT_START_CREDITS = config.DEFAULT_START_CREDITS || 500;
    this.renderCost = config.RENDER_COST || 7;
    this.creditStore = creditStore;
    this.refillRate = config.REFILL_RATE || 25;
    this.refillInterval = config.REFILL_INTERVAL || 3600000;

    creditslog.info('CreditManager instance created.');

    this.cleanup = this.cleanup.bind(this);
    process.on('exit', this.cleanup);

    this.startRefill();
  }

  async startRefill() {
    this.refillLoop = setInterval(async () => {
      const userIDs = await this.creditStore.getAllUserIDs();
      for (const userID of userIDs) {
        const userCredits = await this.fetchUserCredits(userID);
        userCredits.credits += this.refillRate;
        await this.updateUserCredits(userID, userCredits);
      }
    }, this.refillInterval);
  }

  async fetchUserCredits(userID) {
    creditslog.info(`Fetching credits for user: ${userID}`);
    let userCredits = await this.creditStore.retrieveUserCredits(userID);

    if (!userCredits || userCredits.credits === 0) {
      userCredits = { credits: this.DEFAULT_START_CREDITS, lastUpdated: new Date() };
      await this.updateUserCredits(userID, userCredits);
    }
    return userCredits;
  }

  async updateUserCredits(userID, userCredits) {
    await this.creditStore.updateUserCredits(userID, userCredits);
    creditslog.info(`Updated user ${userID} credits to ${userCredits.credits} and last updated date to ${userCredits.lastUpdated}`);
  }

  async deductUserCredits(userID, creditAmount = 1) {
    const userCredits = await this.fetchUserCredits(userID);

    if (userCredits.credits >= creditAmount) {
      userCredits.credits -= creditAmount;
      await this.updateUserCredits(userID, userCredits);
      return true;
    }

    creditslog.warn(`Failed to deduct credit from user ${userID}. User either does not exist or has insufficient credits.`);
    return false;
  }

  async handleRenderCostDeduction(userID) {
    return this.deductUserCredits(userID, this.renderCost);
  }

  async addUserCredits(userID, creditAmount) {
    if (isNaN(creditAmount) || creditAmount <= 0) {
      creditslog.error(`Invalid credit amount: ${creditAmount} for user ${userID}`);
      throw new Error('Invalid credit amount');
    }

    const userCredits = await this.fetchUserCredits(userID);
    userCredits.credits += creditAmount;
    await this.updateUserCredits(userID, userCredits);
  }

  cleanup() {
    clearInterval(this.refillLoop);
    this.creditStore.close();
    creditslog.info('CreditManager instance cleaned up.');
  }
}

module.exports = CreditManager;