import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { setupHoneypot } from '../../services/honeypotService.js';
import { requireAdminAccess } from '../../utils/raidProtectionAccess.js';

export default {
  data: new SlashCommandBuilder()
    .setName('honeypot')
    .setDescription('Create or refresh the raid-protection honeypot channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    requireAdminAccess(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = await setupHoneypot(client, interaction.guild, interaction.user.id);
    await interaction.editReply(`Honeypot active in ${channel}. Non-bot messages there will be softbanned when the bot can moderate the member.`);
  },
};
