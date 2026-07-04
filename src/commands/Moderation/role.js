import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, createEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

function parseUserIds(input) {
  const ids = input.split(/[\s,;]+/).filter(Boolean);
  return ids.map((id) => id.replace(/[<@!>]/g, '')).filter((id) => /^\d{17,20}$/.test(id));
}

export default {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage roles for users.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a role to one or more users.')
        .addStringOption((option) =>
          option
            .setName('users')
            .setDescription('User IDs or mentions (space/comma separated)')
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to add')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from one or more users.')
        .addStringOption((option) =>
          option
            .setName('users')
            .setDescription('User IDs or mentions (space/comma separated)')
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to remove')
            .setRequired(true),
        ),
    ),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) return;

      const { options, guild, member } = interaction;
      const subcommand = options.getSubcommand();
      const role = options.getRole('role');
      const usersInput = options.getString('users');

      if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new TitanBotError(
          'Missing ManageRoles permission',
          ErrorTypes.PERMISSION,
          'You need the `Manage Roles` permission to use this command.',
        );
      }

      const botMember = guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new TitanBotError(
          'Bot missing ManageRoles permission',
          ErrorTypes.PERMISSION,
          'I need the `Manage Roles` permission to do that.',
        );
      }

      if (role.managed) {
        throw new TitanBotError(
          'Role is managed by integration',
          ErrorTypes.VALIDATION,
          `\`${role.name}\` is managed by an integration and cannot be manually assigned.`,
        );
      }

      if (role.position >= botMember.roles.highest.position) {
        throw new TitanBotError(
          'Role is above bot top role',
          ErrorTypes.PERMISSION,
          `\`${role.name}\` is higher than or equal to my highest role.`,
        );
      }

      if (role.position >= member.roles.highest.position) {
        throw new TitanBotError(
          'Role is above user top role',
          ErrorTypes.PERMISSION,
          `\`${role.name}\` is higher than or equal to your highest role.`,
        );
      }

      const rawIds = parseUserIds(usersInput);
      if (rawIds.length === 0) {
        throw new TitanBotError(
          'No valid user IDs',
          ErrorTypes.USER_INPUT,
          'No valid user IDs or mentions found. Provide user IDs or mentions separated by spaces or commas.',
        );
      }

      const results = { succeeded: [], failed: [], notFound: [] };

      for (const userId of rawIds) {
        let target;
        try {
          target = await guild.members.fetch(userId);
        } catch {
          results.notFound.push(userId);
          continue;
        }

        try {
          if (subcommand === 'add') {
            if (target.roles.cache.has(role.id)) {
              results.failed.push({ id: target.id, tag: target.user.tag, reason: 'already has this role' });
              continue;
            }
            await target.roles.add(role, `Role add by ${member.user.tag}`);
          } else {
            if (!target.roles.cache.has(role.id)) {
              results.failed.push({ id: target.id, tag: target.user.tag, reason: 'does not have this role' });
              continue;
            }
            await target.roles.remove(role, `Role remove by ${member.user.tag}`);
          }
          results.succeeded.push({ id: target.id, tag: target.user.tag });
        } catch (error) {
          results.failed.push({ id: target.id, tag: target.user.tag, reason: error.message });
        }
      }

      const actionLabel = subcommand === 'add' ? 'Added' : 'Removed';
      const descParts = [];

      if (results.succeeded.length > 0) {
        const list = results.succeeded.map((u) => `<@${u.id}>`).join('\n');
        descParts.push(`**${actionLabel}** \`${role.name}\` ${subcommand === 'add' ? 'to' : 'from'}:\n${list}`);
      }

      if (results.failed.length > 0) {
        const list = results.failed.map((u) => `<@${u.id}> — ${u.reason}`).join('\n');
        descParts.push(`**Failed:**\n${list}`);
      }

      if (results.notFound.length > 0) {
        descParts.push(`**Not found in server:**\n${results.notFound.map((id) => `\`${id}\``).join('\n')}`);
      }

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createEmbed({
            title: `${actionLabel} Role`,
            description: descParts.join('\n\n'),
            color: subcommand === 'add' ? getColor('success') : getColor('moderation'),
          }),
        ],
      });
    } catch (error) {
      logger.error('Role command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'role_failed' });
    }
  },
};
