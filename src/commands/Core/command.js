import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ApplicationCommandPermissionType,
  MessageFlags,
} from 'discord.js';
import { createEmbed, infoEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

function parseRoleIds(input) {
  return input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((id) => id.replace(/[<@&>]/g, ''))
    .filter((id) => /^\d{17,20}$/.test(id));
}

export default {
  data: new SlashCommandBuilder()
    .setName('command')
    .setDescription('Manage command permissions for roles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View which roles have access to a command.')
        .addStringOption((option) =>
          option
            .setName('command')
            .setDescription('The command to view')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Add or remove role-based access to a command.')
        .addStringOption((option) =>
          option
            .setName('command')
            .setDescription('The command to edit')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('roles')
            .setDescription('Role mentions or IDs (space/comma separated)')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Add or remove access for these roles')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
            ),
        ),
    ),

  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'command') return interaction.respond([]);

    const query = focused.value.toLowerCase();
    const commands = await interaction.guild.commands.fetch();

    const choices = commands
      .filter((cmd) => cmd.name.includes(query))
      .slice(0, 25)
      .map((cmd) => ({ name: `/${cmd.name}`, value: cmd.name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    try {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) return;

      const { options, guild } = interaction;
      const subcommand = options.getSubcommand();
      const commandName = options.getString('command');

      if (commandName === 'command') {
        throw new TitanBotError(
          'Protected command',
          ErrorTypes.VALIDATION,
          'You cannot manage permissions for the `/command` command itself.',
        );
      }

      const guildCommands = await guild.commands.fetch();
      const command = guildCommands.find((cmd) => cmd.name === commandName);

      if (!command) {
        throw new TitanBotError(
          'Command not found',
          ErrorTypes.VALIDATION,
          `Command \`/${commandName}\` was not found in this server.`,
        );
      }

      if (subcommand === 'view') {
        const permissions = await guild.commands.permissions.fetch({ command: command.id });

        if (!permissions || permissions.size === 0) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [
              infoEmbed(
                `/${command.name} — No Role Restrictions`,
                'This command has no role-based permissions set. It uses its default member permissions.',
              ),
            ],
          });
          return;
        }

        const allowedRoles = [];
        const deniedRoles = [];
        const allowedUsers = [];
        const deniedUsers = [];

        for (const perm of permissions.values()) {
          const typeLabel =
            perm.type === ApplicationCommandPermissionType.Role
              ? `<@&${perm.id}>`
              : perm.type === ApplicationCommandPermissionType.User
                ? `<@${perm.id}>`
                : `\`${perm.id}\``;

          if (perm.permission) {
            if (perm.type === ApplicationCommandPermissionType.Role) allowedRoles.push(typeLabel);
            else if (perm.type === ApplicationCommandPermissionType.User) allowedUsers.push(typeLabel);
          } else {
            if (perm.type === ApplicationCommandPermissionType.Role) deniedRoles.push(typeLabel);
            else if (perm.type === ApplicationCommandPermissionType.User) deniedUsers.push(typeLabel);
          }
        }

        const descParts = [];
        if (allowedRoles.length > 0) descParts.push(`**Allowed Roles:**\n${allowedRoles.join('\n')}`);
        if (deniedRoles.length > 0) descParts.push(`**Denied Roles:**\n${deniedRoles.join('\n')}`);
        if (allowedUsers.length > 0) descParts.push(`**Allowed Users:**\n${allowedUsers.join('\n')}`);
        if (deniedUsers.length > 0) descParts.push(`**Denied Users:**\n${deniedUsers.join('\n')}`);

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: `/${command.name} — Permissions`,
              description: descParts.join('\n\n'),
              color: getColor('info'),
            }),
          ],
        });
        return;
      }

      if (subcommand === 'edit') {
        const rolesInput = options.getString('roles');
        const action = options.getString('action');
        const roleIds = parseRoleIds(rolesInput);

        if (roleIds.length === 0) {
          throw new TitanBotError(
            'No valid roles',
            ErrorTypes.USER_INPUT,
            'No valid role IDs or mentions found.',
          );
        }

        for (const roleId of roleIds) {
          if (!guild.roles.cache.has(roleId)) {
            throw new TitanBotError(
              'Role not found',
              ErrorTypes.USER_INPUT,
              `Role with ID \`${roleId}\` not found in this server.`,
            );
          }
        }

        const existingPerms = await guild.commands.permissions.fetch({ command: command.id });
        const permArray = existingPerms.map((p) => ({
          id: p.id,
          type: p.type,
          permission: p.permission,
        }));

        for (const roleId of roleIds) {
          const idx = permArray.findIndex(
            (p) => p.id === roleId && p.type === ApplicationCommandPermissionType.Role,
          );

          if (action === 'add') {
            if (idx !== -1) {
              permArray[idx].permission = true;
            } else {
              permArray.push({
                id: roleId,
                type: ApplicationCommandPermissionType.Role,
                permission: true,
              });
            }
          } else {
            if (idx !== -1) {
              permArray.splice(idx, 1);
            }
          }
        }

        await guild.commands.permissions.set({
          fullPermissions: [
            {
              id: command.id,
              permissions: permArray,
            },
          ],
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Permissions Updated',
              description: `Updated permissions for \`/${command.name}\`. ${roleIds.length} role(s) ${action === 'add' ? 'given access to' : 'removed from'} this command.`,
              color: getColor('success'),
            }),
          ],
        });
      }
    } catch (error) {
      logger.error('Command permission error:', error);
      await handleInteractionError(interaction, error, { subtype: 'command_permission_failed' });
    }
  },
};
