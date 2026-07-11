import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import {
  deleteChannelsCreatedByUser,
  restoreDeletedChannelsForCreator,
} from '../../services/guildStructureService.js';
import { requireOwnerAccess } from '../../utils/raidProtectionAccess.js';

function trimLines(lines, limit = 1900) {
  const output = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > limit) {
      output.push('...output truncated');
      break;
    }
    output.push(line);
    length += line.length + 1;
  }
  return output.join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('unnuke')
    .setDescription('Recover from channel nukes.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete channels created by a specified user.')
        .addStringOption((option) =>
          option
            .setName('userid')
            .setDescription('Discord user ID whose created channels should be deleted')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(20))
        .addIntegerOption((option) =>
          option
            .setName('channeldeletecount')
            .setDescription('Maximum number of matching channels to delete')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500)))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('restore')
        .setDescription('Restore deleted channels previously created by a specified user.')
        .addStringOption((option) =>
          option
            .setName('userid')
            .setDescription('Discord user ID whose deleted channels should be restored')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(20))),

  async execute(interaction, client) {
    requireOwnerAccess(interaction);
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.options.getString('userid', true).trim();

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        content: 'Invalid user ID. Provide the numeric Discord user ID, not a mention.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === 'delete') {
      const count = interaction.options.getInteger('channeldeletecount', true);
      const result = await deleteChannelsCreatedByUser(client, interaction.guild, userId, count);

      await interaction.editReply(trimLines([
        `Unnuke delete complete for user \`${userId}\`.`,
        `Channels deleted: \`${result.deleted}\``,
        `Channels skipped: \`${result.skipped}\``,
        `Audit-log matches considered: \`${result.auditMatches}\``,
        result.failures.length ? 'Failures:' : 'Failures: none',
        ...result.failures.map((failure) => `- ${failure}`),
      ]));
      return;
    }

    const result = await restoreDeletedChannelsForCreator(client, interaction.guild, userId);
    await interaction.editReply(trimLines([
      `Unnuke restore complete for user \`${userId}\`.`,
      `Channels restored: \`${result.restored}\``,
      `Existing/restored channels skipped: \`${result.skipped}\``,
      result.failures.length ? 'Failures or limitations:' : 'Failures: none',
      ...result.failures.map((failure) => `- ${failure}`),
    ]));
  },
};
