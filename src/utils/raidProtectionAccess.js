import { PermissionFlagsBits } from 'discord.js';

export function getOwnerIds() {
  return (process.env.OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isGuildOwnerOrBotOwner(interaction) {
  const ownerIds = getOwnerIds();
  return interaction.guild?.ownerId === interaction.user.id || ownerIds.includes(interaction.user.id);
}

export function isAdministrator(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}

export function requireGuild(interaction) {
  if (!interaction.guild) {
    const error = new Error('This command can only be used in a server.');
    error.userMessage = 'This command can only be used in a server.';
    throw error;
  }
}

export function requireOwnerAccess(interaction) {
  requireGuild(interaction);
  if (!isGuildOwnerOrBotOwner(interaction)) {
    const error = new Error(`User ${interaction.user.id} is not allowed to use owner-only raid commands`);
    error.userMessage = 'Only the guild owner or configured bot owners can use this command.';
    throw error;
  }
}

export function requireAdminAccess(interaction) {
  requireGuild(interaction);
  if (!isAdministrator(interaction)) {
    const error = new Error(`User ${interaction.user.id} is not an administrator`);
    error.userMessage = 'Only server administrators can use this command.';
    throw error;
  }
}
