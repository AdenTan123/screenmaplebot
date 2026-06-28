import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getGuildConfigKey } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getTicketData } from '../../utils/database.js';
import { createPrivateTicket, addUserToTicket, removeUserFromTicket } from '../../services/ticket.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Sets up the ticket creation panel in a specified channel.')
                .addChannelOption((option) =>
                    option
                        .setName('panel_channel')
                        .setDescription('The channel where the ticket panel will be sent.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('panel_message')
                        .setDescription('The main message/description for the ticket panel.')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('button_label')
                        .setDescription('The label for the ticket creation button (default: Create Ticket)')
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName('category')
                        .setDescription('The category where new tickets will be created (optional).')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName('closed_category')
                        .setDescription('The category where closed tickets will be moved (optional).')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName('staff_role_1')
                        .setDescription('First staff role that can access tickets (optional).')
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName('staff_role_2')
                        .setDescription('Second staff role that can access tickets (optional).')
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName('staff_role_3')
                        .setDescription('Third staff role that can access tickets (optional).')
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('max_tickets_per_user')
                        .setDescription('Maximum number of tickets a user can create (default: 3)')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('dm_on_close')
                        .setDescription('Send DM to user when their ticket is closed (default: true)')
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the interactive ticket system dashboard'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('create')
                .setDescription('Create a new ticket panel in a specified channel/category')
                .addChannelOption((option) =>
                    option
                        .setName('panel')
                        .setDescription('The channel or category where the ticket panel will be sent/created')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('panel_message')
                        .setDescription('The main message/description for the ticket panel')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('button_label')
                        .setDescription('The label for the ticket creation button (default: Create Ticket)')
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName('category')
                        .setDescription('The category where new tickets will be created (optional)')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName('closed_category')
                        .setDescription('The category where closed tickets will be moved (optional)')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName('staff_role')
                        .setDescription('The role that can access tickets (optional)')
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('max_tickets_per_user')
                        .setDescription('Maximum number of tickets a user can create (default: 3)')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('dm_on_close')
                        .setDescription('Send DM to user when their ticket is closed (default: true)')
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('private')
                .setDescription('Open a private ticket with a specific user')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The user to open a private ticket with')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('reason')
                        .setDescription('Reason for the private ticket')
                        .setRequired(false)
                        .setMaxLength(1000),
                )
                .addChannelOption((option) =>
                    option
                        .setName('category')
                        .setDescription('Override category for this private ticket (uses default if not set)')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the current ticket channel')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The user to add to this ticket')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the current ticket channel')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The user to remove from this ticket')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('delete')
                .setDescription('Permanently delete the current ticket channel'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('adduser')
                .setDescription('Add a user to the approved users list for ticket creation')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The user to add to the approved list')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('removeuser')
                .setDescription('Remove a user from the approved users list')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The user to remove from the approved list')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('recreatepanel')
                .setDescription('Repost a ticket panel in its configured channel')
                .addChannelOption((option) =>
                    option
                        .setName('panel_channel')
                        .setDescription('The channel whose ticket panel should be reposted')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: 'ticket',

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'You need the `Manage Channels` permission for this action.',
                });
            }

            const subcommand = interaction.options.getSubcommand();

            // ── dashboard ─────────────────────────────────────────────────────────
            if (subcommand === 'dashboard') {
                return ticketConfig.execute(interaction, config, client);
            }

            // ── private ticket ────────────────────────────────────────────────────
            if (subcommand === 'private') {
                return handlePrivateTicket(interaction, client);
            }

            // ── add user to ticket channel ────────────────────────────────────────
            if (subcommand === 'add') {
                return handleAddToTicket(interaction, client);
            }

            // ── remove user from ticket channel ───────────────────────────────────
            if (subcommand === 'remove') {
                return handleRemoveFromTicket(interaction, client);
            }

            // ── delete current ticket channel ─────────────────────────────────────
            if (subcommand === 'delete') {
                return handleDeleteTicket(interaction, client);
            }

            // ── recreate / repost a panel ─────────────────────────────────────────
            if (subcommand === 'recreatepanel') {
                return handleRecreatePanel(interaction, client);
            }

            // ── create panel ──────────────────────────────────────────────────────
            if (subcommand === 'create') {
                return handleCreatePanel(interaction, client);
            }

            // ── adduser (approved list) ───────────────────────────────────────────
            if (subcommand === 'adduser') {
                return handleAddApprovedUser(interaction, client);
            }

            // ── removeuser (approved list) ────────────────────────────────────────
            if (subcommand === 'removeuser') {
                return handleRemoveApprovedUser(interaction, client);
            }

            // ── setup ─────────────────────────────────────────────────────────────
            if (subcommand === 'setup') {
                return handleSetup(interaction, client);
            }

            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Unknown subcommand.',
            });
        } catch (error) {
            logger.error('Error executing ticket command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket',
                source: 'ticket_command_main',
            });
        }
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check if the current channel is a valid ticket
// ─────────────────────────────────────────────────────────────────────────────
async function resolveTicketChannel(interaction) {
    const ticketData = await getTicketData(interaction.guildId, interaction.channel.id);
    return ticketData || null;
}

async function assertStaffPermission(interaction, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const staffRoleId = guildConfig.ticketStaffRoleId;
    const hasManage = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
    const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
    return hasManage || hasStaffRole;
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket private
// ─────────────────────────────────────────────────────────────────────────────
async function handlePrivateTicket(interaction, client) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Private staff ticket';
    const overrideCategory = interaction.options.getChannel('category');

    if (targetUser.id === interaction.user.id) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'You cannot open a private ticket with yourself.',
        });
    }

    if (targetUser.bot) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'You cannot open a private ticket with a bot.',
        });
    }

    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const categoryId = overrideCategory?.id || guildConfig.ticketCategoryId || null;

    const result = await createPrivateTicket(
        interaction.guild,
        interaction.member,
        targetUser,
        categoryId,
        reason,
    );

    if (result.success) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Private Ticket Created',
                    `A private ticket has been opened with ${targetUser} in ${result.channel}.\n**Reason:** ${reason}`,
                ),
            ],
        });
    }

    return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: result.error || 'Failed to create private ticket.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket add
// ─────────────────────────────────────────────────────────────────────────────
async function handleAddToTicket(interaction, client) {
    const isStaff = await assertStaffPermission(interaction, client);
    if (!isStaff) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need **Manage Channels** or the **Ticket Staff Role** to add users to tickets.',
        });
    }

    const ticketData = await resolveTicketChannel(interaction);
    if (!ticketData) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'This command can only be used inside a ticket channel.',
        });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'That user could not be found in this server.',
        });
    }

    const result = await addUserToTicket(interaction.channel, targetMember);

    if (result.success) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('User Added', `${targetUser} has been added to this ticket.`)],
        });
    }

    return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: result.error || 'Failed to add user to ticket.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket remove
// ─────────────────────────────────────────────────────────────────────────────
async function handleRemoveFromTicket(interaction, client) {
    const isStaff = await assertStaffPermission(interaction, client);
    if (!isStaff) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need **Manage Channels** or the **Ticket Staff Role** to remove users from tickets.',
        });
    }

    const ticketData = await resolveTicketChannel(interaction);
    if (!ticketData) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'This command can only be used inside a ticket channel.',
        });
    }

    const targetUser = interaction.options.getUser('user');

    // Protect the ticket creator from being removed
    if (targetUser.id === ticketData.userId) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'You cannot remove the ticket creator from their own ticket.',
        });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const result = await removeUserFromTicket(interaction.channel, targetMember || targetUser);

    if (result.success) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('User Removed', `${targetUser} has been removed from this ticket.`)],
        });
    }

    return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: result.error || 'Failed to remove user from ticket.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket delete
// ─────────────────────────────────────────────────────────────────────────────
async function handleDeleteTicket(interaction, client) {
    const isStaff = await assertStaffPermission(interaction, client);
    if (!isStaff) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need **Manage Channels** or the **Ticket Staff Role** to delete tickets.',
        });
    }

    // Safety: MUST be a verified ticket channel
    const ticketData = await resolveTicketChannel(interaction);
    if (!ticketData) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: '🚫 This channel is not a ticket channel. `/ticket delete` can only be used inside a ticket.',
        });
    }

    const { deleteTicket } = await import('../../services/ticket.js');
    const result = await deleteTicket(interaction.channel, interaction.member);

    if (result.success) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket Deleted', 'This ticket will be permanently deleted in 3 seconds.')],
        });
    }

    return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: result.error || 'Failed to delete ticket.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket recreatepanel
// ─────────────────────────────────────────────────────────────────────────────
async function handleRecreatePanel(interaction, client) {
    const panelChannel = interaction.options.getChannel('panel_channel');
    const guildConfig = await getGuildConfig(client, interaction.guildId);

    // Find the matching panel config for this channel
    const panels = guildConfig.ticketPanels || [];
    const matchingPanel = panels.find((p) => p.panelChannelId === panelChannel.id);

    // Also check legacy single-panel config
    const isLegacyPanel = !matchingPanel && guildConfig.ticketPanelChannelId === panelChannel.id;

    if (!matchingPanel && !isLegacyPanel) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `No ticket panel is configured for ${panelChannel}. Use \`/ticket create\` or \`/ticket setup\` to set one up first.`,
        });
    }

    const panelMessage = matchingPanel?.panelMessage || guildConfig.ticketPanelMessage || 'Click the button below to create a support ticket.';
    const buttonLabel = matchingPanel?.buttonLabel || guildConfig.ticketButtonLabel || 'Create Ticket';

    const setupEmbed = createEmbed({
        title: 'Support Tickets',
        description: panelMessage,
        color: getColor('info'),
    });

    const ticketButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );

    try {
        // Try to delete the old panel message first
        const oldMessageId = matchingPanel?.panelMessageId || guildConfig.ticketPanelMessageId;
        if (oldMessageId) {
            const oldMsg = await panelChannel.messages.fetch(oldMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
        }

        const sentPanel = await panelChannel.send({
            embeds: [setupEmbed],
            components: [ticketButton],
        });

        // Update the stored message ID
        if (matchingPanel) {
            matchingPanel.panelMessageId = sentPanel.id;
        } else {
            guildConfig.ticketPanelMessageId = sentPanel.id;
        }
        await client.db.set(getGuildConfigKey(interaction.guildId), guildConfig);

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Panel Recreated',
                    `The ticket panel has been reposted in ${panelChannel}.`,
                ),
            ],
        });
    } catch (error) {
        logger.error('Failed to recreate ticket panel', { error: error.message, guildId: interaction.guildId });
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: `Could not repost the panel in ${panelChannel}. Check my permissions in that channel.`,
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket create (panel)
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreatePanel(interaction, client) {
    const panelChannel = interaction.options.getChannel('panel');
    const categoryChannel = interaction.options.getChannel('category');
    const closedCategoryChannel = interaction.options.getChannel('closed_category');
    const staffRole = interaction.options.getRole('staff_role');
    const panelMessage = interaction.options.getString('panel_message') || 'Click the button below to create a support ticket.';
    const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';
    const maxTicketsPerUser = interaction.options.getInteger('max_tickets_per_user') || 3;
    const dmOnClose = interaction.options.getBoolean('dm_on_close') !== false;

    let targetChannel = panelChannel;
    if (panelChannel.type === ChannelType.GuildCategory) {
        const textChannels = panelChannel.children.cache.filter((c) => c.type === ChannelType.GuildText);
        targetChannel = textChannels.first();
        if (!targetChannel) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'The selected category has no text channels. Create one first or select a text channel directly.',
            });
        }
    }

    const setupEmbed = createEmbed({
        title: 'Support Tickets',
        description: panelMessage,
        color: getColor('info'),
    });

    const ticketButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );

    try {
        const sentPanel = await targetChannel.send({
            embeds: [setupEmbed],
            components: [ticketButton],
        });

        if (client.db && interaction.guildId) {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            const currentConfig = existingConfig || {};

            if (!currentConfig.ticketPanels) currentConfig.ticketPanels = [];

            currentConfig.ticketPanels.push({
                panelChannelId: targetChannel.id,
                panelMessageId: sentPanel?.id || null,
                panelMessage,
                buttonLabel,
                categoryId: categoryChannel?.id || null,
                closedCategoryId: closedCategoryChannel?.id || null,
                staffRoleId: staffRole?.id || null,
                maxTicketsPerUser,
                dmOnClose,
                createdAt: new Date().toISOString(),
            });

            // Set legacy keys only if this is the first panel
            if (!currentConfig.ticketPanelChannelId) {
                currentConfig.ticketCategoryId = categoryChannel?.id || null;
                currentConfig.ticketClosedCategoryId = closedCategoryChannel?.id || null;
                currentConfig.ticketStaffRoleId = staffRole?.id || null;
                currentConfig.ticketPanelChannelId = targetChannel.id;
                currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                currentConfig.ticketPanelMessage = panelMessage;
                currentConfig.ticketButtonLabel = buttonLabel;
                currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                currentConfig.dmOnClose = dmOnClose;
            }

            const { getGuildConfigKey } = await import('../../utils/database.js');
            await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);
        }

        let successMessage = `The ticket panel has been sent to ${targetChannel}.`;
        if (categoryChannel) successMessage += ` New tickets → **${categoryChannel.name}**.`;
        if (closedCategoryChannel) successMessage += ` Closed tickets → **${closedCategoryChannel.name}**.`;
        if (staffRole) successMessage += ` Staff role: **${staffRole.name}**.`;
        successMessage += `\n\n**Max Tickets/User:** ${maxTicketsPerUser} | **DM on Close:** ${dmOnClose ? 'Yes' : 'No'}`;

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket Panel Created', successMessage)],
        });
    } catch (error) {
        logger.error('Ticket create panel error', { error: error.message, guildId: interaction.guildId });
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: "Could not send the ticket panel. Check my permissions in that channel.",
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket adduser (approved list)
// ─────────────────────────────────────────────────────────────────────────────
async function handleAddApprovedUser(interaction, client) {
    const targetUser = interaction.options.getUser('user');

    if (!client.db) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Database unavailable.' });
    }

    const existingConfig = await getGuildConfig(client, interaction.guildId);
    const currentConfig = existingConfig || {};
    if (!currentConfig.ticketAllowedUsers) currentConfig.ticketAllowedUsers = [];

    if (currentConfig.ticketAllowedUsers.includes(targetUser.id)) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `${targetUser} is already in the approved users list.`,
        });
    }

    currentConfig.ticketAllowedUsers.push(targetUser.id);
    const { getGuildConfigKey } = await import('../../utils/database.js');
    await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('User Added', `${targetUser} has been added to the approved users list.`)],
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket removeuser (approved list)
// ─────────────────────────────────────────────────────────────────────────────
async function handleRemoveApprovedUser(interaction, client) {
    const targetUser = interaction.options.getUser('user');

    if (!client.db) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Database unavailable.' });
    }

    const existingConfig = await getGuildConfig(client, interaction.guildId);
    const currentConfig = existingConfig || {};

    if (!currentConfig.ticketAllowedUsers?.length) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'The approved users list is empty.',
        });
    }

    if (!currentConfig.ticketAllowedUsers.includes(targetUser.id)) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `${targetUser} is not in the approved users list.`,
        });
    }

    currentConfig.ticketAllowedUsers = currentConfig.ticketAllowedUsers.filter((id) => id !== targetUser.id);
    const { getGuildConfigKey } = await import('../../utils/database.js');
    await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('User Removed', `${targetUser} has been removed from the approved users list.`)],
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket setup (legacy single-panel)
// ─────────────────────────────────────────────────────────────────────────────
async function handleSetup(interaction, client) {
    const existingConfig = await getGuildConfig(client, interaction.guildId);
    if (existingConfig?.ticketPanelChannelId) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: `This server already has a ticket system set up (panel in <#${existingConfig.ticketPanelChannelId}>).\n\nUse \`/ticket dashboard\` to edit it, or \`/ticket create\` to add another panel.`,
        });
    }

    const panelChannel = interaction.options.getChannel('panel_channel');
    const categoryChannel = interaction.options.getChannel('category');
    const closedCategoryChannel = interaction.options.getChannel('closed_category');
    const staffRole = interaction.options.getRole('staff_role');
    const panelMessage = interaction.options.getString('panel_message') || 'Click the button below to create a support ticket.';
    const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';
    const maxTicketsPerUser = interaction.options.getInteger('max_tickets_per_user') || 3;
    const dmOnClose = interaction.options.getBoolean('dm_on_close') !== false;

    const setupEmbed = createEmbed({
        title: 'Support Tickets',
        description: panelMessage,
        color: getColor('info'),
    });

    const ticketButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );

    try {
        const sentPanel = await panelChannel.send({
            embeds: [setupEmbed],
            components: [ticketButton],
        });

        if (client.db && interaction.guildId) {
            const currentConfig = existingConfig || {};
            currentConfig.ticketCategoryId = categoryChannel?.id || null;
            currentConfig.ticketClosedCategoryId = closedCategoryChannel?.id || null;
            currentConfig.ticketStaffRoleId = staffRole?.id || null;
            currentConfig.ticketPanelChannelId = panelChannel.id;
            currentConfig.ticketPanelMessageId = sentPanel?.id || null;
            currentConfig.ticketPanelMessage = panelMessage;
            currentConfig.ticketButtonLabel = buttonLabel;
            currentConfig.maxTicketsPerUser = maxTicketsPerUser;
            currentConfig.dmOnClose = dmOnClose;

            const { getGuildConfigKey } = await import('../../utils/database.js');
            await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);
        }

        let successMessage = `The ticket panel has been sent to ${panelChannel}.`;
        if (categoryChannel) successMessage += ` New tickets → **${categoryChannel.name}**.`;
        if (closedCategoryChannel) successMessage += ` Closed tickets → **${closedCategoryChannel.name}**.`;
        if (staffRole) successMessage += ` Staff role: **${staffRole.name}**.`;
        successMessage += `\n\n**Max Tickets/User:** ${maxTicketsPerUser} | **DM on Close:** ${dmOnClose ? 'Yes' : 'No'}`;

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket Panel Set Up', successMessage)],
        });
    } catch (error) {
        logger.error('Ticket setup error', { error: error.message, guildId: interaction.guildId });
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: "Could not send the ticket panel. Check my permissions in that channel.",
        });
    }
}