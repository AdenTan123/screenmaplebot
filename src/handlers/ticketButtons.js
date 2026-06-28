import { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  AttachmentBuilder, 
  MessageFlags,
  ButtonStyle,
  ButtonBuilder
} from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { 
  createTicket, 
  closeTicket, 
  claimTicket, 
  updateTicketPriority 
} from '../services/ticket.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logger } from '../utils/logger.js';

/**
 * Handles all button interactions related to the ticket system
 * @param {ButtonInteraction} interaction 
 */
export async function handleTicketButtons(interaction) {
  const { customId, guild, member, channel } = interaction;

  // Handle panel ticket creation trigger
  if (customId.startsWith('create_ticket:')) {
    const panelId = customId.split(':')[1];
    return handleCreateTicketTicketClick(interaction, panelId);
  }

  switch (customId) {
    case 'ticket_claim': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await claimTicket(channel, member);
      
      if (!result.success) {
        return interaction.editReply({ content: result.error });
      }

      // Update the control panel buttons to reflect the claimed status
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claimed')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🙋')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ticket_pin')
          .setLabel('Pin')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📌'),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒')
      );

      await interaction.message.edit({ components: [updatedRow] });
      return interaction.editReply({ content: 'You have successfully claimed this ticket.' });
    }

    case 'ticket_close': {
      // Prompt modal for closing reason
      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Close Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Reason for closing')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Provide a reason for closing this ticket...')
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return interaction.showModal(modal);
    }

    case 'ticket_pin': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await channel.pin();
        return interaction.editReply({ content: '📌 Ticket channel pinned successfully.' });
      } catch (error) {
        logger.error('Failed to pin ticket channel:', error);
        return interaction.editReply({ content: 'Failed to pin this channel. Ensure I have the right permissions.' });
      }
    }

    default: {
      // Handle dynamic priority adjustment buttons (e.g., ticket_priority:high)
      if (customId.startsWith('ticket_priority:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const priority = customId.split(':')[1];
        const result = await updateTicketPriority(channel, priority, member);

        if (!result.success) {
          return interaction.editReply({ content: result.error });
        }
        return interaction.editReply({ content: `Ticket priority updated to **${priority.toUpperCase()}**.` });
      }
    }
  }
}

/**
 * Handles the initial interaction when a user clicks a "Create Ticket" panel button
 */
async function handleCreateTicketTicketClick(interaction, panelId) {
  const { guild, member } = interaction;
  
  // FIX: Fetch config safely once at the beginning to avoid duplicate declarations
  const config = await getGuildConfig(guild.client, guild.id);
  const ticketConfig = config?.tickets?.[panelId] || config?.tickets || {};
  const maxTicketsPerUser = config?.maxTicketsPerUser ?? 3;

  // Show a modal asking for the ticket reason
  const modal = new ModalBuilder()
    .setCustomId(`ticket_create_modal:${panelId}`)
    .setTitle(ticketConfig.modalTitle || 'Create a Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('ticket_reason')
    .setLabel('Why are you opening this ticket?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe your issue or question here...')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

/**
 * Handles modal submissions (for creation and closing)
 * @param {ModalSubmitInteraction} interaction 
 */
export async function handleTicketModals(interaction) {
  const { customId, guild, member, channel, fields } = interaction;

  if (customId.startsWith('ticket_create_modal:')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const panelId = customId.split(':')[1];
    const reason = fields.getTextInputValue('ticket_reason');

    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config?.tickets?.[panelId] || {};
    const categoryId = ticketConfig.ticketCategoryId || null;

    const result = await createTicket(guild, member, categoryId, reason, 'none');

    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }

    return interaction.editReply({ 
      content: `📬 Your ticket has been created successfully: ${result.channel.toString()}` 
    });
  }

  if (customId === 'ticket_close_modal') {
    await interaction.deferReply();
    const reason = fields.getTextInputValue('close_reason') || 'No reason provided';
    
    const result = await closeTicket(channel, member, reason);
    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }
  }
}