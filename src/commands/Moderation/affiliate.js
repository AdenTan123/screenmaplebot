import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, createEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const ALLOWED_GUILD = '1523193006285525022';
const EXTRA_ROLE = '1523208981495943272';

function parseIds(input) {
  return input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((s) => s.replace(/[<@!>&]/g, ''))
    .filter((s) => /^\d{17,20}$/.test(s));
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

export default {
  data: new SlashCommandBuilder()
    .setName('affiliate')
    .setDescription('Manage affiliate partnerships.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add an affiliate partner for specified guilds only')
        .addStringOption((o) =>
          o.setName('servername').setDescription('The affiliate server name').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('users').setDescription('User mentions or IDs (space/comma separated)').setRequired(true),
        ),
    ),

  category: 'moderation',

  async execute(interaction, _, client) {
    try {
      if (interaction.guildId !== ALLOWED_GUILD) {
        throw new TitanBotError('Command Not Supported In Guild', ErrorTypes.PERMISSION, 'This command is restricted to a specific guild and is not supported in this server.');
      }

      const deferred = await InteractionHelper.safeDefer(interaction);
      if (!deferred) return;

      const { options, guild } = interaction;
      const name = options.getString('servername').trim();
      if (!name) throw new TitanBotError('Empty name', ErrorTypes.USER_INPUT, 'Server name is required.');

      const me = guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new TitanBotError('No ManageRoles', ErrorTypes.PERMISSION, 'I need Manage Roles.');
      }
      if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new TitanBotError('No ManageChannels', ErrorTypes.PERMISSION, 'I need Manage Channels.');
      }

      const extra = guild.roles.cache.get(EXTRA_ROLE);
      if (!extra) throw new TitanBotError('Missing role', ErrorTypes.CONFIGURATION, 'Extra role not found.');

      const userIds = parseIds(options.getString('users'));
      if (!userIds.length) throw new TitanBotError('No users', ErrorTypes.USER_INPUT, 'No valid users found.');

      const safe = slug(name);
      const roleName = `${name} Affiliates`;

      const role = await guild.roles.create({ name: roleName, reason: `Affiliate: ${name}` });
      await role.setPosition(role.position + 1);

      const ok = [];
      const errs = [];

      for (const id of userIds) {
        try {
          const m = await guild.members.fetch(id);
          await m.roles.add([role.id, extra.id], `${name} affiliate`);
          ok.push(m.user.tag);
        } catch (e) {
          errs.push(`<@${id}> — ${e.message}`);
        }
      }

      if (!ok.length) {
        await role.delete('No assignable users');
        throw new TitanBotError('All failed', ErrorTypes.USER_INPUT, 'Could not assign any user.');
      }

      const category = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        reason: `Affiliate: ${name}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: role.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });

      await guild.channels.create({
        name: `${safe}-announcements`,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Affiliate announcements: ${name}`,
        permissionOverwrites: [
          { id: role.id, deny: [PermissionFlagsBits.SendMessages] },
        ],
      });

      await guild.channels.create({
        name: `💬┆${safe}-chat`,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Affiliate chat: ${name}`,
        permissionOverwrites: [
          {
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.AddReactions,
              PermissionFlagsBits.UseExternalEmojis,
            ],
          },
        ],
      });

      const desc = [
        `**Server:** ${name}`,
        `**Role:** ${role}`,
        `**Category:** ${category.name}`,
        `**Assigned (${ok.length}):** ${ok.map((t) => `\`${t}\``).join(', ')}`,
      ];
      if (errs.length) desc.push(`**Failed:**\n${errs.join('\n')}`);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: 'Affiliate Added', description: desc.join('\n\n'), color: getColor('success') })],
      });
    } catch (error) {
      logger.error('affiliate error:', error);
      await handleInteractionError(interaction, error, { subtype: 'affiliate_failed' });
    }
  },
};
