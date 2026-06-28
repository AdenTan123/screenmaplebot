import {
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogChannel,
  updateIgnoreList,
  getIgnoreList,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { successEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

const DESTINATION_LABELS = {
  audit: 'Audit Log',
  applications: 'Applications',
  reports: 'Reports',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_back',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ You need **Manage Server** permissions to use this.',
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: '❌ The logging dashboard is not available.',
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error in logging button handler:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true,
      }).catch(() => {});
    }
  },
};

export async function handleLoggingMenuSelect(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need **Manage Server** permissions to use this.',
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: '❌ The logging dashboard is not available.',
    ephemeral: true,
  });
}