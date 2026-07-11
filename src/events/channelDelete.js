import { Events } from 'discord.js';
import { recordDeletedChannelSnapshot } from '../services/guildStructureService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ChannelDelete,

  async execute(channel, client) {
    try {
      await recordDeletedChannelSnapshot(client, channel, {
        reason: 'channelDelete event',
      });
    } catch (error) {
      logger.error(`Failed to record deleted channel snapshot for ${channel?.id}:`, error);
    }
  },
};
