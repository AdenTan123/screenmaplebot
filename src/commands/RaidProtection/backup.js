import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { createGuildBackup, restoreGuildBackup } from '../../services/guildStructureService.js';
import { getBackup, listBackups } from '../../services/raidProtectionStorage.js';
import { requireOwnerAccess } from '../../utils/raidProtectionAccess.js';

function formatBytes(bytes = 0) {
  if (!bytes) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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
    .setName('backup')
    .setDescription('Create and restore guild structure backups.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('save')
        .setDescription('Create a complete guild structure backup.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('restore')
        .setDescription('Restore a saved guild structure backup.')
        .addStringOption((option) =>
          option
            .setName('savehash')
            .setDescription('Backup hash or latest')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List stored guild backups.')),

  async autocomplete(interaction, client) {
    const focused = interaction.options.getFocused()?.toLowerCase() || '';
    const backups = await listBackups(client, interaction.guildId);
    const choices = [
      { name: 'latest', value: 'latest' },
      ...backups
        .filter((backup) => backup.hash.toLowerCase().startsWith(focused))
        .slice(0, 24)
        .map((backup) => ({
          name: `${backup.hash.slice(0, 16)} - ${backup.guildName} - ${new Date(backup.createdAt).toLocaleString()}`,
          value: backup.hash,
        })),
    ];

    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction, client) {
    requireOwnerAccess(interaction);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'save') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { backup, metadata } = await createGuildBackup(client, interaction.guild);

      await interaction.editReply([
        'Backup saved.',
        `Hash: \`${backup.hash}\``,
        `Created: \`${backup.createdAt}\``,
        `Channels: \`${metadata.channelCount}\``,
        `Roles: \`${metadata.roleCount}\``,
        `Size: \`${formatBytes(metadata.sizeBytes)}\``,
      ].join('\n'));
      return;
    }

    if (subcommand === 'restore') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const requestedHash = interaction.options.getString('savehash', true).trim();
      const backup = await getBackup(client, interaction.guildId, requestedHash);

      if (!backup) {
        await interaction.editReply('No backup matched that hash. Use `/backup list` or select a value from autocomplete.');
        return;
      }

      const result = await restoreGuildBackup(interaction.guild, backup);
      await interaction.editReply(trimLines([
        `Backup restored: \`${backup.hash}\``,
        `Roles created: \`${result.rolesCreated}\`, updated: \`${result.rolesUpdated}\``,
        `Channels created: \`${result.channelsCreated}\`, updated/skipped: \`${result.channelsUpdated}\``,
        result.failures.length ? 'Failures or partial restores:' : 'Failures: none',
        ...result.failures.map((failure) => `- ${failure}`),
      ]));
      return;
    }

    const backups = await listBackups(client, interaction.guildId);
    if (backups.length === 0) {
      await interaction.reply({ content: 'No backups are stored for this server.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: trimLines([
        'Stored backups, newest first:',
        ...backups.map((backup) =>
          `\`${backup.hash}\` | ${new Date(backup.createdAt).toLocaleString()} | ${backup.guildName} | channels ${backup.channelCount} | roles ${backup.roleCount} | ${formatBytes(backup.sizeBytes)}`
        ),
      ]),
    });
  },
};
