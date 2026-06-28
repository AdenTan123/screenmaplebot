import { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  MessageFlags,
  ButtonStyle,
  ButtonBuilder
} from 'discord.js';
import { 
  closeTicket, 
  claimTicket, 
  updateTicketPriority 
} from '../services/ticket.js';
import { logger } from '../utils/logger.js';

// ==========================================
// PRIVATE TICKET BUTTON HANDLERS
// ==========================================

/**
 * Handles claiming a private ticket channel
 */
export const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction) {
    const { channel, member } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const result = await claimTicket(channel, member);
    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }

    // Update the control panel message inside the channel
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
    return interaction.editReply({ content: 'You have successfully claimed this private ticket.' });
  }
};

/**
 * Spawns the close reasoning modal inside the private channel
 */
export const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('ticket_close_modal')
      .setTitle('Close Private Ticket');

    const reasonInput = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Reason for closing')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide a closure reason...')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }
};

/**
 * Pins the private ticket channel for reference
 */
export const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction) {
    const { channel } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await channel.pin();
      return interaction.editReply({ content: '📌 Ticket channel pinned successfully.' });
    } catch (error) {
      logger.error('Failed to pin private ticket channel:', error);
      return interaction.editReply({ content: 'Failed to pin this channel. Check my permissions.' });
    }
  }
};

/**
 * Priority handling switch inside the ticket
 */
export const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction) {
    const { customId, channel, member } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const priority = customId.split(':')[1] || 'low';
    
    const result = await updateTicketPriority(channel, priority, member);
    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }
    return interaction.editReply({ content: `Ticket priority updated to **${priority.toUpperCase()}**.` });
  }
};

// Clean placeholders for array matching stability inside buttons/ticket.js
export const unclaimTicketHandler = { name: 'ticket_unclaim', async execute(i) { await i.reply({ content: 'Feature disabled.', flags: MessageFlags.Ephemeral }); } };
export const reopenTicketHandler  = { name: 'ticket_reopen',  async execute(i) { await i.reply({ content: 'Feature disabled.', flags: MessageFlags.Ephemeral }); } };
export const deleteTicketHandler  = { name: 'ticket_delete',  async execute(i) { await i.reply({ content: 'Feature disabled.', flags: MessageFlags.Ephemeral }); } };

// Dummy placeholder to safely satisfy the main creator default import signature if left untouched
const createTicketHandler = { name: 'create_ticket', async execute(i) { } };
export default createTicketHandler;


// ==========================================
// PRIVATE TICKET MODAL HANDLERS
// ==========================================

/**
 * Executes the modal closure collection sequence
 */
export const closeTicketModalHandler = {
  name: 'ticket_close_modal',
  async execute(interaction) {
    const { channel, member, fields } = interaction;
    await interaction.deferReply();
    
    const reason = fields.getTextInputValue('close_reason') || 'No reason provided';
    const result = await closeTicket(channel, member, reason);
    
    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }
  }
};

// Empty baseline exporter to keep modal/ticket.js from throwing unmapped import errors
export const createTicketModalHandler = { name: 'ticket_create_modal', async execute(i) { } };