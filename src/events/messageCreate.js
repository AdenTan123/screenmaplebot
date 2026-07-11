import { Events } from 'discord.js';
import { handleHoneypotMessage } from '../services/honeypotService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    try {
      await handleHoneypotMessage(message, client);
    } catch (error) {
      logger.error('Error in honeypot message handler:', error);
    }
  },
};
