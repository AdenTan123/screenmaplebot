import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Sets up the ticket creation panel in a specified channel.",
                )
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription(
                            "The channel where the ticket panel will be sent.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "The main message/description for the ticket panel.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "The label for the ticket creation button (default: Create Ticket)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "The category where new tickets will be created (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "The category where closed tickets will be moved (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "The role that can access tickets (optional).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum number of tickets a user can create (default: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Send DM to user when their ticket is closed (default: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the interactive ticket system dashboard"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create a new ticket panel in a specified channel/category")
                .addChannelOption((option) =>
                    option
                        .setName("panel")
                        .setDescription("The channel or category where the ticket panel will be sent/created")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription("The main message/description for the ticket panel")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription("The label for the ticket creation button (default: Create Ticket)")
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("The category where new tickets will be created (optional)")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription("The category where closed tickets will be moved (optional)")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription("The role that can access tickets (optional)")
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum number of tickets a user can create (default: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Send DM to user when their ticket is closed (default: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("adduser")
                .setDescription("Add a user to the approved users list for ticket creation")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user to add to the approved list")
                        .setRequired(true),
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("removeuser")
                .setDescription("Remove a user from the approved users list")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user to remove from the approved list")
                        .setRequired(true),
                )
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                logger.warn('Ticket command permission denied', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket'
                });
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission for this action.' });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === "dashboard") {
                return ticketConfig.execute(interaction, config, client);
            }

            if (subcommand === "create") {
                const panelChannel = interaction.options.getChannel("panel");
                const categoryChannel = interaction.options.getChannel("category");
                const closedCategoryChannel = interaction.options.getChannel("closed_category");
                const staffRole = interaction.options.getRole("staff_role");
                const panelMessage = interaction.options.getString("panel_message") || "Click the button below to create a support ticket.";
                const buttonLabel = interaction.options.getString("button_label") || "Create Ticket";
                const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
                const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

                let targetChannel = panelChannel;
                if (panelChannel.type === ChannelType.GuildCategory) {
                    const category = panelChannel;
                    const textChannels = category.children.cache.filter(c => c.type === ChannelType.GuildText);
                    targetChannel = textChannels.first();

                    if (!targetChannel) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.VALIDATION,
                            message: 'The selected category does not contain any text channels. Please create a text channel in the category first, or select a text channel directly.'
                        });
                    }
                }

                const setupEmbed = createEmbed({
                    title: "Support Tickets",
                    description: panelMessage,
                    color: getColor('info')
                });

                const ticketButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📩"),
                );

                try {
                    const sentPanel = await targetChannel.send({
                        embeds: [setupEmbed],
                        components: [ticketButton],
                    });

                    if (client.db && interaction.guildId) {
                        const existingConfig = await getGuildConfig(client, interaction.guildId);
                        const currentConfig = existingConfig || {};

                        if (!currentConfig.ticketPanels) {
                            currentConfig.ticketPanels = [];
                        }

                        currentConfig.ticketPanels.push({
                            panelChannelId: panelChannel.id,
                            panelMessageId: sentPanel?.id || null,
                            panelMessage: panelMessage,
                            buttonLabel: buttonLabel,
                            categoryId: categoryChannel ? categoryChannel.id : null,
                            closedCategoryId: closedCategoryChannel ? closedCategoryChannel.id : null,
                            staffRoleId: staffRole ? staffRole.id : null,
                            maxTicketsPerUser: maxTicketsPerUser,
                            dmOnClose: dmOnClose,
                            createdAt: new Date().toISOString(),
                        });

                        if (!currentConfig.ticketPanelChannelId) {
                            currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                            currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                            currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                            currentConfig.ticketPanelChannelId = panelChannel.id;
                            currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                            currentConfig.ticketPanelMessage = panelMessage;
                            currentConfig.ticketButtonLabel = buttonLabel;
                            currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                            currentConfig.dmOnClose = dmOnClose;
                        }

                        const { getGuildConfigKey } = await import('../../utils/database.js');
                        const configKey = getGuildConfigKey(interaction.guildId);
                        await client.db.set(configKey, currentConfig);
                        logger.info('Ticket panel created', {
                            guildId: interaction.guildId,
                            panelChannelId: panelChannel.id,
                            categoryId: categoryChannel?.id,
                            closedCategoryId: closedCategoryChannel?.id,
                            staffRoleId: staffRole?.id,
                            maxTickets: maxTicketsPerUser,
                            dmOnClose: dmOnClose
                        });
                    }

                    let successMessage = `The ticket creation panel has been sent to ${targetChannel}. `;

                    if (categoryChannel) {
                        successMessage += `New tickets will be created in the **${categoryChannel.name}** category. `;
                    } else {
                        successMessage += 'New tickets will be created in a new "Tickets" category. ';
                    }

                    if (closedCategoryChannel) {
                        successMessage += `Closed tickets will be moved to **${closedCategoryChannel.name}**. `;
                    }

                    if (staffRole) {
                        successMessage += `**${staffRole.name}** role will have access to tickets.`;
                    }

                    successMessage += `\n\n**Max Tickets Per User:** ${maxTicketsPerUser}\n**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`;

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Ticket Panel Created",
                                successMessage,
                            ),
                        ],
                    });

                    logger.info('Ticket panel created successfully', {
                        userId: interaction.user.id,
                        userTag: interaction.user.tag,
                        guildId: interaction.guildId,
                        panelChannelId: panelChannel.id,
                        targetChannelId: targetChannel.id,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                        commandName: 'ticket_create_panel'
                    });

                } catch (error) {
                    logger.error('Ticket create panel error', {
                        error: error.message,
                        stack: error.stack,
                        userId: interaction.user.id,
                        guildId: interaction.guildId,
                        commandName: 'ticket_create_panel'
                    });
                    if (interaction.deferred || interaction.replied) {
                        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not send the ticket panel or save configuration. Check the bot\'s permissions (especially the ability to send messages in the target channel) and database connection.' }).catch(err => {
                            logger.error('Failed to send error reply', {
                                error: err.message,
                                guildId: interaction.guildId
                            });
                        });
                    } else {
                        await handleInteractionError(interaction, error, {
                            commandName: 'ticket_create_panel',
                            source: 'ticket_create_panel_command'
                        });
                    }
                }
                return;
            }

            if (subcommand === "adduser") {
                const targetUser = interaction.options.getUser("user");

                if (client.db && interaction.guildId) {
                    const existingConfig = await getGuildConfig(client, interaction.guildId);
                    const currentConfig = existingConfig || {};

                    if (!currentConfig.ticketAllowedUsers) {
                        currentConfig.ticketAllowedUsers = [];
                    }

                    if (currentConfig.ticketAllowedUsers.includes(targetUser.id)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.VALIDATION,
                            message: `${targetUser} is already in the approved users list.`
                        });
                    }

                    currentConfig.ticketAllowedUsers.push(targetUser.id);

                    const { getGuildConfigKey } = await import('../../utils/database.js');
                    const configKey = getGuildConfigKey(interaction.guildId);
                    await client.db.set(configKey, currentConfig);

                    logger.info('User added to ticket allowed list', {
                        guildId: interaction.guildId,
                        targetUserId: targetUser.id,
                        addedBy: interaction.user.id,
                        commandName: 'ticket_adduser'
                    });

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "User Added to Approved List",
                                `${targetUser} has been added to the approved users list for ticket creation.`,
                            ),
                        ],
                    });
                }
                return;
            }

            if (subcommand === "removeuser") {
                const targetUser = interaction.options.getUser("user");

                if (client.db && interaction.guildId) {
                    const existingConfig = await getGuildConfig(client, interaction.guildId);
                    const currentConfig = existingConfig || {};

                    if (!currentConfig.ticketAllowedUsers || currentConfig.ticketAllowedUsers.length === 0) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.VALIDATION,
                            message: 'The approved users list is empty.'
                        });
                    }

                    if (!currentConfig.ticketAllowedUsers.includes(targetUser.id)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.VALIDATION,
                            message: `${targetUser} is not in the approved users list.`
                        });
                    }

                    currentConfig.ticketAllowedUsers = currentConfig.ticketAllowedUsers.filter(id => id !== targetUser.id);

                    const { getGuildConfigKey } = await import('../../utils/database.js');
                    const configKey = getGuildConfigKey(interaction.guildId);
                    await client.db.set(configKey, currentConfig);

                    logger.info('User removed from ticket allowed list', {
                        guildId: interaction.guildId,
                        targetUserId: targetUser.id,
                        removedBy: interaction.user.id,
                        commandName: 'ticket_removeuser'
                    });

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "User Removed from Approved List",
                                `${targetUser} has been removed from the approved users list for ticket creation.`,
                            ),
                        ],
                    });
                }
                return;
            }

            if (subcommand === "setup") {
                const existingConfig = await getGuildConfig(client, interaction.guildId);
                if (existingConfig?.ticketPanelChannelId) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `This server already has a ticket system set up (panel in <#${existingConfig.ticketPanelChannelId}>).\n\nOnly one ticket system is supported per server. Use \`/ticket dashboard\` to edit or update the existing setup, or select **Delete System** from the dashboard to remove it and start fresh.` });
                }

                const panelChannel = interaction.options.getChannel("panel_channel");
                const categoryChannel = interaction.options.getChannel("category");
                const closedCategoryChannel = interaction.options.getChannel("closed_category");
                const staffRole = interaction.options.getRole("staff_role");
                const panelMessage = interaction.options.getString("panel_message") || "Click the button below to create a support ticket.";
                const buttonLabel = interaction.options.getString("button_label") || "Create Ticket";
                const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
                const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

                const setupEmbed = createEmbed({
                    title: "Support Tickets",
                    description: panelMessage,
                    color: getColor('info')
                });

                const ticketButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📩"),
                );

                try {
                    const sentPanel = await panelChannel.send({
                        embeds: [setupEmbed],
                        components: [ticketButton],
                    });

                    if (client.db && interaction.guildId) {
                        const currentConfig = existingConfig || {};
                        currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                        currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                        currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                        currentConfig.ticketPanelChannelId = panelChannel.id;
                        currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                        currentConfig.ticketPanelMessage = panelMessage;
                        currentConfig.ticketButtonLabel = buttonLabel;
                        currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                        currentConfig.dmOnClose = dmOnClose;

                        const { getGuildConfigKey } = await import('../../utils/database.js');
                        const configKey = getGuildConfigKey(interaction.guildId);
                        await client.db.set(configKey, currentConfig);
                        logger.info('Ticket configuration saved', {
                            guildId: interaction.guildId,
                            categoryId: categoryChannel?.id,
                            closedCategoryId: closedCategoryChannel?.id,
                            staffRoleId: staffRole?.id,
                            maxTickets: maxTicketsPerUser,
                            dmOnClose: dmOnClose
                        });
                    }

                    let successMessage = `The ticket creation panel has been sent to ${panelChannel}. `;

                    if (categoryChannel) {
                        successMessage += `New tickets will be created in the **${categoryChannel.name}** category. `;
                    } else {
                        successMessage += 'New tickets will be created in a new "Tickets" category. ';
                    }

                    if (closedCategoryChannel) {
                        successMessage += `Closed tickets will be moved to **${closedCategoryChannel.name}**. `;
                    }

                    if (staffRole) {
                        successMessage += `**${staffRole.name}** role will have access to tickets.`;
                    }

                    successMessage += `\n\n**Max Tickets Per User:** ${maxTicketsPerUser}\n**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`;

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Ticket Panel Set Up",
                                successMessage,
                            ),
                        ],
                    });

                    logger.info('Ticket panel setup completed', {
                        userId: interaction.user.id,
                        userTag: interaction.user.tag,
                        guildId: interaction.guildId,
                        panelChannelId: panelChannel.id,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                        commandName: 'ticket_setup'
                    });

                } catch (error) {
                    logger.error('Ticket setup error', {
                        error: error.message,
                        stack: error.stack,
                        userId: interaction.user.id,
                        guildId: interaction.guildId,
                        commandName: 'ticket_setup'
                    });
                    if (interaction.deferred || interaction.replied) {
                        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not send the ticket panel or save configuration. Check the bot\'s permissions (especially the ability to send messages in the target channel) and database connection.' }).catch(err => {
                            logger.error('Failed to send error reply', {
                                error: err.message,
                                guildId: interaction.guildId
                            });
                        });
                    } else {
                        await handleInteractionError(interaction, error, {
                            commandName: 'ticket_setup',
                            source: 'ticket_setup_command'
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('Error executing ticket command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket',
                source: 'ticket_command_main'
            });
        }
    }
};