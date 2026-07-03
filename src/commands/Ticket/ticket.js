import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getGuildConfigKey } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { getTicketData } from '../../utils/database.js';
import { createTicket, addUserToTicket, removeUserFromTicket, closeTicket, deleteTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Sets up the ticket system with category, staff roles, and logs channel')
                .addChannelOption((option) =>
                    option
                        .setName('category')
                        .setDescription('The category where new tickets will be created')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true),
                )
                .addRoleOption((option) =>
                    option
                        .setName('staff_role')
                        .setDescription('The staff role that can access tickets')
                        .setRequired(true),
                )
                .addChannelOption((option) =>
                    option
                        .setName('ticket_logs_channel')
                        .setDescription('The channel where ticket transcripts will be sent')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('create')
                .setDescription('Create a new ticket')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The user to create the ticket for')
                        .setRequired(false),
                )
                .addUserOption((option) =>
                    option
                        .setName('creator')
                        .setDescription('The user who created this ticket (defaults to command user)')
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('reason')
                        .setDescription('Reason for the ticket')
                        .setRequired(true)
                        .setMaxLength(1000),
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
                .setName('close')
                .setDescription('Close and delete the current ticket channel, saving a transcript to the logs'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('delete')
                .setDescription('Permanently delete the current ticket channel and send transcript to logs'),
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

            // ── setup ─────────────────────────────────────────────────────────────
            if (subcommand === 'setup') {
                return handleSetup(interaction, client);
            }

            // ── create ────────────────────────────────────────────────────────────
            if (subcommand === 'create') {
                return handleCreateTicket(interaction, client);
            }

            // ── add user to ticket channel ────────────────────────────────────────
            if (subcommand === 'add') {
                return handleAddToTicket(interaction, client);
            }

            // ── remove user from ticket channel ───────────────────────────────────
            if (subcommand === 'remove') {
                return handleRemoveFromTicket(interaction, client);
            }

            // ── close current ticket channel ───────────────────────────────────────
            if (subcommand === 'close') {
                return handleCloseTicket(interaction, client);
            }

            // ── delete current ticket channel ─────────────────────────────────────
            if (subcommand === 'delete') {
                return handleDeleteTicket(interaction, client);
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
// /ticket setup
// ─────────────────────────────────────────────────────────────────────────────
async function handleSetup(interaction, client) {
    const category = interaction.options.getChannel('category');
    const staffRole = interaction.options.getRole('staff_role');
    const ticketLogsChannel = interaction.options.getChannel('ticket_logs_channel');

    if (!client.db) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Database unavailable.'
        });
    }

    try {
        const guildConfig = await getGuildConfig(client, interaction.guildId);

        // Update the configuration
        guildConfig.ticketCategoryId = category.id;
        guildConfig.ticketStaffRoleId = staffRole.id;
        guildConfig.ticketTranscriptChannelId = ticketLogsChannel.id;

        const { getGuildConfigKey } = await import('../../utils/database.js');
        await client.db.set(getGuildConfigKey(interaction.guildId), guildConfig);

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket System Setup',
                `Ticket system has been configured:\n` +
                `• Category: ${category}\n` +
                `• Staff Role: ${staffRole}\n` +
                `• Logs Channel: ${ticketLogsChannel}`)],
        });
    } catch (error) {
        logger.error('Ticket setup error', {
            error: error.message,
            guildId: interaction.guildId
        });
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Failed to set up ticket system. Please check my permissions.',
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// /ticket create
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreateTicket(interaction, client) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const creatorOverride = interaction.options.getUser('creator') || null;
    const reason = interaction.options.getString('reason');

    try {
        const guildConfig = await getGuildConfig(client, interaction.guildId);
        const categoryId = guildConfig.ticketCategoryId;

        if (!categoryId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Ticket system not set up. Please use `/ticket setup` first.',
            });
        }

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'That user could not be found in this server.',
            });
        }

        const ticketOwner = creatorOverride || interaction.user;

        const result = await createTicket(
            interaction.guild,
            targetMember,
            categoryId,
            reason,
            'none'
        );

        if (result.success) {
            if (creatorOverride && targetUser.id !== creatorOverride.id) {
                await result.channel.permissionOverwrites.create(ticketOwner.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                }).catch(() => {});
            }

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Ticket Created',
                    `A ticket has been created in ${result.channel} for ${targetUser}\n**Reason:** ${reason}`)],
            });
        }

        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: result.error || 'Failed to create ticket.',
        });
    } catch (error) {
        logger.error('Ticket create error', {
            error: error.message,
            guildId: interaction.guildId
        });
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Failed to create ticket. Please try again.',
        });
    }
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

    // Protect staff/moderators from being removed
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const staffRoleId = guildConfig.ticketStaffRoleId;
    if (staffRoleId) {
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && targetMember.roles.cache.has(staffRoleId)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'You cannot remove a staff member from a ticket.',
            });
        }
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
// /ticket close
// Closes the ticket, generates + sends transcript, then deletes the channel
// ─────────────────────────────────────────────────────────────────────────────
async function handleCloseTicket(interaction, client) {
    const permissionContext = await getTicketPermissionContext({ client, interaction });
    if (!permissionContext.ticketData) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'This command can only be used inside a ticket channel.',
        });
    }

    if (!permissionContext.canCloseTicket) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need **Manage Channels**, the **Ticket Staff Role**, or be the ticket creator to close this ticket.',
        });
    }

    const result = await closeTicket(interaction.channel, interaction.user, 'Closed via /ticket close', true);

    if (result.success) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket Closed',
                'This ticket has been closed. A transcript has been saved to the log channel, and the channel will be deleted shortly.')],
        });
    }

    return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: result.error || 'Failed to close ticket.',
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

    const result = await deleteTicket(interaction.channel, interaction.member);

    if (result.success) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Ticket Deleted', 'This ticket will be permanently deleted in 3 seconds and a transcript will be sent to the logs channel.')],
        });
    }

    return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: result.error || 'Failed to delete ticket.',
    });
}

