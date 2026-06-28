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
  createTicket, 
  closeTicket, 
  claimTicket, 
  updateTicketPriority 
} from '../services/ticket.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logger } from '../utils/logger.js';

// ==========================================
// BUTTON HANDLERS (Exported Objects)
// ==========================================

// 1. Create Ticket Trigger (Default Export expected by buttons/ticket.js)
const createTicketHandler = {
  name: 'create_ticket', // Matches starting string or exact customId depending on router matching rule
  async execute(interaction) {
    const { customId, guild } = interaction;
    const panelId = customId.split(':')[1] || 'default';
    
    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config?.tickets?.[panelId] || config?.tickets || {};

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
};

export default createTicketHandler;

// 2. Claim Ticket Button
export const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction) {
    const { channel, member } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const result = await claimTicket(channel, member);
    if (!result.success) {
      return interaction.editReply({ content: result.error });
    }

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
};

// 3. Close Ticket Trigger Button
export const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction) {
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
};

// 4. Pin Ticket Button
export const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction) {
    const { channel } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await channel.pin();
      return interaction.editReply({ content: '📌 Ticket channel pinned successfully.' });
    } catch (error) {
      logger.error('Failed to pin ticket channel:', error);
      return interaction.editReply({ content: 'Failed to pin this channel. Ensure I have the right permissions.' });
    }
  }
};

// 5. Adjust Priority Button
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

// Placeholders for remaining button hooks expected by buttons/ticket.js array
export const unclaimTicketHandler = { name: 'ticket_unclaim', async execute(i) { await i.reply({ content: 'Feature coming soon.', flags: MessageFlags.Ephemeral }); } };
export const reopenTicketHandler = { name: 'ticket_reopen', async execute(i) { await i.reply({ content: 'Feature coming soon.', flags: MessageFlags.Ephemeral }); } };
export const deleteTicketHandler = { name: 'ticket_delete', async execute(i) { await i.reply({ content: 'Feature coming soon.', flags: MessageFlags.Ephemeral }); } };


// ==========================================
// MODAL HANDLERS (Exported Objects)
// ==========================================

// 1. Ticket Creation Form Submission
export const createTicketModalHandler = {
  name: 'ticket_create_modal',
  async execute(interaction) {
    const { customId, guild, member, fields } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const panelId = customId.split(':')[1] || 'default';
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
};

// 2. Ticket Closing Form Submission
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