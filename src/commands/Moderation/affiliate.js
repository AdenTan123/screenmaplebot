import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const ALLOWED_GUILD_ID = '1523193006285525022';

function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u{1F000}-\u{1FFFF}\-_]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 95);
}

export default {
  data: new SlashCommandBuilder()
    .setName('affiliate')
    .setDescription('Manage affiliate partnerships.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add an affiliate partner.')
        .addStringOption((option) =>
          option
            .setName('servername')
            .setDescription('The name of the affiliate server')
            .setRequired(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The affiliate representative')
            .setRequired(true),
        ),
    ),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      if (interaction.guildId !== ALLOWED_GUILD_ID) {
        throw new TitanBotError(
          'Guild not allowed',
          ErrorTypes.PERMISSION,
          'This command can only be used in the designated server.',
        );
      }

      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) return;

      const { options, guild } = interaction;
      const servername = options.getString('servername').trim();
      const targetUser = options.getUser('user');

      if (!servername) {
        throw new TitanBotError(
          'Invalid server name',
          ErrorTypes.USER_INPUT,
          'Server name cannot be empty.',
        );
      }

      const safeName = sanitizeName(servername);
      const roleName = `${servername} Affiliates`;

      const botMember = guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new TitanBotError(
          'Missing ManageRoles',
          ErrorTypes.PERMISSION,
          'I need the `Manage Roles` permission to do that.',
        );
      }
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new TitanBotError(
          'Missing ManageChannels',
          ErrorTypes.PERMISSION,
          'I need the `Manage Channels` permission to do that.',
        );
      }

      const role = await guild.roles.create({
        name: roleName,
        reason: `Affiliate partner: ${servername}`,
      });

      const targetMember = await guild.members.fetch(targetUser.id);
      await targetMember.roles.add(role, `Added as ${servername} affiliate`);

      const category = await guild.channels.create({
        name: servername,
        type: ChannelType.GuildCategory,
        reason: `Affiliate category for ${servername}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });

      await guild.channels.create({
        name: `${safeName}-announcements`,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Affiliate announcements for ${servername}`,
        permissionOverwrites: [
          {
            id: role.id,
            deny: [PermissionFlagsBits.SendMessages],
          },
        ],
      });

      await guild.channels.create({
        name: `💬┆${safeName}-chat`,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Affiliate chat for ${servername}`,
        permissionOverwrites: [
          {
            id: role.id,
            allow: [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.AddReactions,
              PermissionFlagsBits.UseExternalEmojis,
            ],
          },
        ],
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Affiliate Added',
            `**Server:** ${servername}\n**User:** ${targetUser.tag}\n**Role:** ${role}\n**Category:** ${category.name}`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Affiliate command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'affiliate_add_failed' });
    }
  },
};
