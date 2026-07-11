import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

async function replySafely(interaction, payload) {
  const body = { flags: MessageFlags.Ephemeral, ...payload };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(body).catch(() => null);
  }

  return interaction.reply(body).catch(() => null);
}

export default {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        return interaction.respond([]).catch(() => null);
      }

      try {
        await command.autocomplete(interaction, client);
      } catch (error) {
        logger.error(`Autocomplete failed for /${interaction.commandName}:`, error);
        await interaction.respond([]).catch(() => null);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await replySafely(interaction, {
        content: 'That command is no longer available on this bot.',
      });
      return;
    }

    try {
      logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`, {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        command: interaction.commandName,
      });

      await command.execute(interaction, client);
    } catch (error) {
      logger.error(`Error executing /${interaction.commandName}:`, error);
      await replySafely(interaction, {
        content: error?.userMessage || 'The command failed. Check the bot logs for details.',
      });
    }
  },
};
