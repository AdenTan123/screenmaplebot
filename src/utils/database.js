// database.js — Facade re-exporting split modules for backward compatibility updated for MongoDB

import { MongoClient } from 'mongodb';
import { logger } from './logger.js';
import { BotConfig } from '../config/bot.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from './schemas.js';
import { DEFAULT_GUILD_CONFIG } from './constants.js';

// MongoDB Connection Setup
const mongoUri = process.env.MONGODB_URI || "none";
const mongoClient = new MongoClient(mongoUri);
let mongoDb = null;

// Helper to get collection instance safely
function getCollection(name) {
    if (!mongoDb) {
        throw new Error("Database not initialized. Call initializeDatabase() first.");
    }
    return mongoDb.collection(name);
}

export async function initializeDatabase() {
    try {
        logger.info("Connecting to MongoDB Atlas...");
        await mongoClient.connect();
        mongoDb = mongoClient.db("screenmapledb"); // Database name
        logger.info("Successfully connected to MongoDB!");
        return true;
    } catch (error) {
        logger.error("Failed to connect to MongoDB:", error);
        return false;
    }
}

export async function getFromDb(key, defaultValue = null) {
    try {
        const col = getCollection("kv_store");
        const doc = await col.findOne({ _id: key });
        return doc ? doc.value : defaultValue;
    } catch (error) {
        logger.error(`Error fetching key ${key} from MongoDB:`, error);
        return defaultValue;
    }
}

export async function setInDb(key, value) {
    try {
        const col = getCollection("kv_store");
        // 💡 FIXED: Changed 'upsers: true' to 'upsert: true'
        await col.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
        return true;
    } catch (error) {
        logger.error(`Error setting key ${key} in MongoDB:`, error);
        return false;
    }
}

export async function deleteFromDb(key) {
    try {
        const col = getCollection("kv_store");
        await col.deleteOne({ _id: key });
        return true;
    } catch (error) {
        logger.error(`Error deleting key ${key} from MongoDB:`, error);
        return false;
    }
}

// Emulating backward compatibility exports for generic wrappers if required elsewhere
export const db = {
    get initialized() { return !!mongoDb; },
    isAvailable: () => !!mongoDb,
    initialize: initializeDatabase,
    
    // 💡 FIXED: Mapped missing operations to resolve service failures
    get: getFromDb,
    set: setInDb,
    delete: deleteFromDb
};

export {
    getGuildConfigKey,
    getGuildBirthdaysKey,
    getTicketKey,
    getTicketCounterKey,
    getInviteTrackingKey,
    getMemberInvitesKey,
    getInviteUsesKey,
    getFakeAccountKey,
    getEconomyKey,
    getAFKKey,
    getWelcomeConfigKey,
    getLevelingKey,
    getUserLevelKey,
    getApplicationRolesKey,
    getApplicationSettingsKey,
    getUserApplicationsKey,
    getApplicationKey,
    getJoinToCreateConfigKey,
    getJoinToCreateChannelsKey,
} from './database/keys.js';

export {
    getTicketData,
    getOpenTicketCountForUser,
    saveTicketData,
    deleteTicketData,
    getTicketCounter,
    incrementTicketCounter,
    getGuildTicketStats,
} from './database/tickets.js';

import {
    getGuildConfigKey,
    getGuildBirthdaysKey,
    getLevelingKey,
    getUserLevelKey,
    getApplicationRolesKey,
    getApplicationSettingsKey,
    getUserApplicationsKey,
    getApplicationKey,
    getJoinToCreateConfigKey,
    getWelcomeConfigKey,
} from './database/keys.js';

export async function insertVerificationAudit(record) {
    try {
        const col = getCollection("verification_audits");
        await col.insertOne({
            ...record,
            createdAt: record.createdAt || new Date().toISOString()
        });
        return true;
    } catch (error) {
        logger.error('Error storing verification audit in MongoDB:', error);
        return false;
    }
}

// Kept for legacy fallback compatibility
export function unwrapReplitData(data) {
    return data;
}

export async function getGuildConfig(client, guildId, context = {}) {
    try {
        const configKey = getGuildConfigKey(guildId);
        const cleanedConfig = await getFromDb(configKey, {});
        return normalizeGuildConfig(cleanedConfig, DEFAULT_GUILD_CONFIG);
    } catch (error) {
        logger.error(`Error fetching config for guild ${guildId}`, { error, ...context });
        return {};
    }
}

export async function setGuildConfig(client, guildId, config, context = {}) {
    try {
        const key = getGuildConfigKey(guildId);
        const validated = validateGuildConfigOrThrow(config, { guildId, ...context });
        await setInDb(key, validated);
        return true;
    } catch (error) {
        logger.error(`Error saving config for guild ${guildId}`, { error, ...context });
        return false;
    }
}

export const getMessage = (key, replacements = {}) => {
    let message = BotConfig.messages[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return message;
};

export const getColor = (path, fallback = "#000000") => {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            logger.warn(`Color path '${path}' not found in config, using fallback`);
            return fallback;
        }
        current = current[part];
    }
    return typeof current === "string" ? current : fallback;
};

export async function getGuildBirthdays(client, guildId) {
    const key = getGuildBirthdaysKey(guildId);
    return await getFromDb(key, {});
}

export async function setBirthday(client, guildId, userId, month, day) {
    try {
        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        birthdays[userId] = { month, day };
        await setInDb(key, birthdays);
        return true;
    } catch (error) {
        logger.error(`Error setting birthday for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}

export async function deleteBirthday(client, guildId, userId) {
    try {
        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        if (birthdays[userId]) {
            delete birthdays[userId];
            await setInDb(key, birthdays);
        }
        return true;
    } catch (error) {
        logger.error(`Error deleting birthday for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}

export function getMonthName(monthNum) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const index = Math.max(0, Math.min(monthNum - 1, 11));
    return monthNum >= 1 && monthNum <= 12 ? months[index] : 'Invalid Month';
}

export async function getEndedGiveaways(client) {
    try {
        const col = getCollection("giveaways");
        const now = new Date();
        const results = await col.find({
            endsAt: { $lte: now },
            "data.ended": { $ne: true }
        }).sort({ endsAt: 1 }).toArray();

        return results.map(row => ({
            id: row._id,
            guild_id: row.guildId,
            message_id: row.messageId,
            data: row.data,
            ends_at: row.endsAt
        }));
    } catch (error) {
        logger.error('Error getting ended giveaways from MongoDB:', error);
        return [];
    }
}

export async function markGiveawayEnded(client, giveawayId, endedData) {
    try {
        const col = getCollection("giveaways");
        await col.updateOne(
            { _id: giveawayId },
            { $set: { data: endedData, updatedAt: new Date() } }
        );
        return true;
    } catch (error) {
        logger.error('Error marking giveaway as ended in MongoDB:', error);
        return false;
    }
}

function normalizeWelcomeConfig(raw = {}) {
    const base = typeof raw === "object" && raw !== null ? raw : {};
    return {
        ...base,
        enabled: Boolean(base.enabled),
        channelId: base.channelId ?? null,
        welcomeMessage: base.welcomeMessage ?? "Welcome {user} to {server}!",
        welcomeEmbed: base.welcomeEmbed ?? {
            title: "🎉 Welcome!",
            description: "Welcome {user} to {server}!",
            color: getColor("success"),
            thumbnail: true,
            footer: "Welcome to {server}!"
        },
        welcomePing: Boolean(base.welcomePing),
        welcomeImage: base.welcomeImage ?? null,
        goodbyeEnabled: Boolean(base.goodbyeEnabled),
        goodbyeChannelId: base.goodbyeChannelId ?? null,
        leaveMessage: base.leaveMessage ?? "{user.tag} has left the server.",
        leaveEmbed: base.leaveEmbed ?? {
            title: "👋 Goodbye",
            description: "{user.tag} has left the server.",
            color: getColor("error"),
            thumbnail: true,
            footer: "Goodbye from {server}!"
        },
        dmMessage: base.dmMessage ?? "",
        goodbyePing: Boolean(base.goodbyePing),
        roleIds: Array.isArray(base.roleIds) ? base.roleIds : [],
        autoRoleDelay: base.autoRoleDelay ?? 0,
        joinLogs: base.joinLogs ?? { enabled: false, channelId: null },
        leaveLogs: base.leaveLogs ?? { enabled: false, channelId: null }
    };
}

export async function getWelcomeConfig(client, guildId) {
    const key = getWelcomeConfigKey(guildId);
    const config = await getFromDb(key, {});
    return normalizeWelcomeConfig(config);
}

export async function saveWelcomeConfig(client, guildId, config) {
    const key = getWelcomeConfigKey(guildId);
    try {
        const existingConfig = await getWelcomeConfig(client, guildId);
        await setInDb(key, { ...existingConfig, ...config });
        return true;
    } catch (error) {
        logger.error(`Error saving welcome config for guild ${guildId}:`, error);
        return false;
    }
}

export async function updateWelcomeConfig(client, guildId, updates) {
    const currentConfig = await getWelcomeConfig(client, guildId);
    const updatedConfig = { ...currentConfig, ...updates };
    await saveWelcomeConfig(client, guildId, updatedConfig);
    return updatedConfig;
}

export async function getLevelingConfig(client, guildId) {
    const key = getLevelingKey(guildId);
    return await getFromDb(key, {
        enabled: false,
        xpPerMessage: 10,
        xpPerMinute: 60,
        cooldownEnabled: true,
        messageLengthMultiplier: true,
        levelUpMessages: true,
        levelUpChannel: null,
        roles: {},
        milestones: {}
    });
}

export async function saveLevelingConfig(client, guildId, config) {
    const key = getLevelingKey(guildId);
    return await setInDb(key, config);
}

export async function getUserLevelData(client, guildId, userId) {
    const key = getUserLevelKey(guildId, userId);
    const data = await getFromDb(key, null);
    if (!data) {
        return { xp: 0, level: 0, totalXp: 0, lastMessage: 0, rank: 0, xpToNextLevel: getXpForLevel(1) };
    }
    return {
        ...data,
        xpToNextLevel: getXpForLevel((data.level || 0) + 1)
    };
}

export async function saveUserLevelData(client, guildId, userId, data) {
    const key = getUserLevelKey(guildId, userId);
    return await setInDb(key, { ...data, updatedAt: Date.now() });
}

export function getXpForLevel(level) {
    return 5 * Math.pow(level, 2) + 50 * level + 50;
}

export async function getLeaderboard(client, guildId, limit = 10) {
    try {
        const col = getCollection("kv_store");
        const prefix = `guild:${guildId}:leveling:users:`;
        
        const docs = await col.find({ _id: { $regex: `^${prefix}` } }).toArray();
        let userData = docs.map(doc => {
            const userId = doc._id.replace(prefix, '');
            return {
                userId,
                xp: doc.value.xp || 0,
                level: doc.value.level || 0,
                totalXp: doc.value.totalXp || 0,
                rank: 0
            };
        });

        userData.sort((a, b) => b.totalXp - a.totalXp);
        return userData.map((user, idx) => ({ ...user, rank: idx + 1 })).slice(0, limit);
    } catch (error) {
        logger.error(`Error getting leaderboard for guild ${guildId}:`, error);
        return [];
    }
}

export async function getApplicationRoles(client, guildId) {
    const key = getApplicationRolesKey(guildId);
    return await getFromDb(key, []);
}

export async function saveApplicationRoles(client, guildId, roles) {
    const key = getApplicationRolesKey(guildId);
    return await setInDb(key, roles);
}

export async function getApplicationSettings(client, guildId) {
    const key = getApplicationSettingsKey(guildId);
    const unwrapped = await getFromDb(key, {});
    const defaultSettings = {
        enabled: false, applicationChannelId: null, logChannelId: null,
        questions: ["Why do you want to join our staff team?", "What experience do you have?", "How much time?"],
        roles: { admin: null, reviewer: null, accepted: null, denied: null },
        requiredRoles: [], deniedRoles: [], minAccountAge: 0, maxApplications: 1, cooldown: 7,
        allowMultipleApplications: false, requireVerification: false, customWelcomeMessage: "",
        pendingApplicationRetentionDays: 30, reviewedApplicationRetentionDays: 14
    };
    return { ...defaultSettings, ...unwrapped };
}

function getApplicationRetentionDays(settings = {}) {
    const pendingRaw = Number(settings.pendingApplicationRetentionDays);
    const reviewedRaw = Number(settings.reviewedApplicationRetentionDays);
    return {
        pendingDays: Number.isFinite(pendingRaw) ? Math.min(Math.max(pendingRaw, 1), 3650) : 30,
        reviewedDays: Number.isFinite(reviewedRaw) ? Math.min(Math.max(reviewedRaw, 1), 3650) : 14
    };
}

// Helper block for application checking logic
function isApplicationExpired(application, retentionDays, now = Date.now()) {
    if (!application) return false;
    const createdAt = Number(application.createdAt) || now;
    const status = typeof application.status === 'string' ? application.status.toLowerCase() : 'pending';
    const age = now - createdAt;
    return status === 'pending' ? age > retentionDays.pendingDays * 86400000 : age > retentionDays.reviewedDays * 86400000;
}

export async function deleteApplication(client, guildId, applicationId, userIdHint = null) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        const existing = await getFromDb(key, null);
        const userId = userIdHint || existing?.userId;
        await deleteFromDb(key);

        if (userId) {
            const userKey = getUserApplicationsKey(guildId, userId);
            const ids = await getFromDb(userKey, []);
            await setInDb(userKey, ids.filter(id => id !== applicationId));
        }
        return true;
    } catch (error) {
        logger.error(`Error deleting application ${applicationId}:`, error);
        return false;
    }
}

export async function cleanupExpiredApplications(client, guildId) {
    try {
        const col = getCollection("kv_store");
        const settings = await getApplicationSettings(client, guildId);
        const retentionDays = getApplicationRetentionDays(settings);
        const prefix = `guild:${guildId}:applications:`;
        
        const docs = await col.find({ _id: { $regex: `^${prefix}` } }).toArray();
        const now = Date.now();
        let removed = 0;

        for (const doc of docs) {
            if (isApplicationExpired(doc.value, retentionDays, now)) {
                const deleted = await deleteApplication(client, guildId, doc.value.id, doc.value.userId);
                if (deleted) removed++;
            }
        }
        return { removed, scanned: docs.length };
    } catch (error) {
        logger.error(`Error cleaning applications:`, error);
        return { removed: 0, scanned: 0 };
    }
}

export async function saveApplicationSettings(client, guildId, settings) {
    const key = getApplicationSettingsKey(guildId);
    const existing = await getApplicationSettings(client, guildId);
    return await setInDb(key, { ...existing, ...settings });
}

function getApplicationRoleSettingsKey(guildId, roleId) {
    return `guild:${guildId}:applications:role:${roleId}:settings`;
}

export async function getApplicationRoleSettings(client, guildId, roleId) {
    const key = getApplicationRoleSettingsKey(guildId, roleId);
    return await getFromDb(key, { questions: null, logChannelId: null });
}

export async function saveApplicationRoleSettings(client, guildId, roleId, settings) {
    const key = getApplicationRoleSettingsKey(guildId, roleId);
    return await setInDb(key, settings);
}

export async function deleteApplicationRoleSettings(client, guildId, roleId) {
    const key = getApplicationRoleSettingsKey(guildId, roleId);
    return await deleteFromDb(key);
}

export async function createApplication(client, application) {
    const { guildId, userId } = application;
    const applicationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = getApplicationKey(guildId, applicationId);
    
    const newApplication = {
        ...application, id: applicationId, status: 'pending',
        createdAt: Date.now(), updatedAt: Date.now(), reviewedBy: null, reviewedAt: null, notes: []
    };
    
    await setInDb(key, newApplication);
    const userKey = getUserApplicationsKey(guildId, userId);
    const userApps = await getFromDb(userKey, []);
    userApps.push(applicationId);
    await setInDb(userKey, userApps);
    
    return newApplication;
}

export async function getApplication(client, guildId, applicationId) {
    const key = getApplicationKey(guildId, applicationId);
    return await getFromDb(key, null);
}

export async function updateApplication(client, guildId, applicationId, updates) {
    const key = getApplicationKey(guildId, applicationId);
    const existing = await getApplication(client, guildId, applicationId);
    if (!existing) throw new Error("Application not found");
    
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await setInDb(key, updated);
    return updated;
}

export async function getUserApplications(client, guildId, userId) {
    const userKey = getUserApplicationsKey(guildId, userId);
    const ids = await getFromDb(userKey, []);
    const promises = ids.map(id => getApplication(client, guildId, id));
    return (await Promise.all(promises)).filter(Boolean);
}

export async function getApplications(client, guildId, filters = {}) {
    try {
        const col = getCollection("kv_store");
        const prefix = `guild:${guildId}:applications:`;
        const docs = await col.find({ _id: { $regex: `^${prefix}` } }).toArray();
        let applications = docs.map(d => d.value).filter(Boolean);

        if (filters.status) applications = applications.filter(app => app.status === filters.status);
        if (filters.userId) applications = applications.filter(app => app.userId === filters.userId);
        
        applications.sort((a, b) => b.createdAt - a.createdAt);
        return applications.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50));
    } catch (error) {
        logger.error(error);
        return [];
    }
}

export async function getJoinToCreateConfig(client, guildId) {
    const key = getJoinToCreateConfigKey(guildId);
    return await getFromDb(key, {
        enabled: false, triggerChannels: [], categoryId: null,
        channelNameTemplate: "{username}'s Room", userLimit: 0, bitrate: 64000, temporaryChannels: {}
    });
}

export async function saveJoinToCreateConfig(client, guildId, config) {
    const key = getJoinToCreateConfigKey(guildId);
    const existing = await getJoinToCreateConfig(client, guildId);
    return await setInDb(key, { ...existing, ...config });
}

export async function updateJoinToCreateConfig(client, guildId, updates) {
    const current = await getJoinToCreateConfig(client, guildId);
    const updated = { ...current, ...updates };
    await saveJoinToCreateConfig(client, guildId, updated);
    return updated;
}

export async function addJoinToCreateTrigger(client, guildId, channelId, options = {}) {
    const config = await getJoinToCreateConfig(client, guildId);
    if (config.triggerChannels.includes(channelId)) return false;
    
    config.triggerChannels.push(channelId);
    config.enabled = true;
    if (Object.keys(options).length > 0) {
        if (!config.channelOptions) config.channelOptions = {};
        config.channelOptions[channelId] = {
            nameTemplate: options.nameTemplate || config.channelNameTemplate,
            userLimit: options.userLimit || config.userLimit,
            bitrate: options.bitrate || config.bitrate
        };
    }
    return await saveJoinToCreateConfig(client, guildId, config);
}

export async function removeJoinToCreateTrigger(client, guildId, channelId) {
    const config = await getJoinToCreateConfig(client, guildId);
    const index = config.triggerChannels.indexOf(channelId);
    if (index === -1) return false;
    
    config.triggerChannels.splice(index, 1);
    config.enabled = config.triggerChannels.length > 0;
    if (config.channelOptions) delete config.channelOptions[channelId];
    return await saveJoinToCreateConfig(client, guildId, config);
}

export async function registerTemporaryChannel(client, guildId, channelId, ownerId, triggerChannelId) {
    const config = await getJoinToCreateConfig(client, guildId);
    config.temporaryChannels[channelId] = { ownerId, triggerChannelId, createdAt: Date.now() };
    return await saveJoinToCreateConfig(client, guildId, config);
}

export async function unregisterTemporaryChannel(client, guildId, channelId) {
    const config = await getJoinToCreateConfig(client, guildId);
    if (config.temporaryChannels[channelId]) {
        delete config.temporaryChannels[channelId];
        return await saveJoinToCreateConfig(client, guildId, config);
    }
    return false;
}

export async function getTemporaryChannelInfo(client, guildId, channelId) {
    const config = await getJoinToCreateConfig(client, guildId);
    return config.temporaryChannels[channelId] || null;
}

export function formatChannelName(template, variables) {
    let formatted = template;
    const replacements = {
        '{username}': variables.username || 'User',
        '{user_tag}': variables.userTag || 'User#0000',
        '{display_name}': variables.displayName || 'User',
        '{guild_name}': variables.guildName || 'Server',
        '{channel_name}': variables.channelName || 'Voice Channel'
    };
    for (const [placeholder, value] of Object.entries(replacements)) {
        formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    return formatted.replace(/[^\w\s-]/g, '').trim().substring(0, 100) || 'Voice Channel';
}