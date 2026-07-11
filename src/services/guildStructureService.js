import crypto from 'crypto';
import {
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import {
  getDeletedChannelsByCreator,
  saveBackup,
  updateDeletedChannel,
  upsertDeletedChannel,
} from './raidProtectionStorage.js';
import { logger } from '../utils/logger.js';

const OPERATION_DELAY_MS = 350;
const CHANNEL_CREATE_AUDIT_PAGE_LIMIT = 10;

function delay(ms = OPERATION_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSequential(items, worker) {
  const results = [];
  for (const item of items) {
    results.push(await worker(item));
    await delay();
  }
  return results;
}

function serializeOverwrite(overwrite) {
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  };
}

function deserializeOverwrites(overwrites = [], roleMap = new Map()) {
  return overwrites.map((overwrite) => ({
    id: overwrite.type === 0 && roleMap.has(overwrite.id) ? roleMap.get(overwrite.id) : overwrite.id,
    type: overwrite.type,
    allow: BigInt(overwrite.allow || 0),
    deny: BigInt(overwrite.deny || 0),
  }));
}

function serializeDefaultReactionEmoji(emoji) {
  if (!emoji) {
    return null;
  }

  return {
    emojiId: emoji.id || null,
    emojiName: emoji.name || null,
  };
}

function serializeAvailableTags(tags) {
  if (!tags) {
    return [];
  }

  return [...tags.values()].map((tag) => ({
    id: tag.id,
    name: tag.name,
    moderated: tag.moderated,
    emojiId: tag.emoji?.id || tag.emojiId || null,
    emojiName: tag.emoji?.name || tag.emojiName || null,
  }));
}

export function snapshotRole(role) {
  return {
    id: role.id,
    name: role.name,
    everyone: role.id === role.guild.id,
    managed: role.managed,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    unicodeEmoji: role.unicodeEmoji || null,
  };
}

export function snapshotChannel(channel, metadata = {}) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.position ?? channel.rawPosition ?? 0,
    rawPosition: channel.rawPosition ?? channel.position ?? 0,
    parentId: channel.parentId || null,
    permissionOverwrites: channel.permissionOverwrites?.cache?.map(serializeOverwrite) || [],
    topic: 'topic' in channel ? channel.topic : null,
    nsfw: 'nsfw' in channel ? channel.nsfw : false,
    rateLimitPerUser: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser : 0,
    bitrate: 'bitrate' in channel ? channel.bitrate : null,
    userLimit: 'userLimit' in channel ? channel.userLimit : null,
    rtcRegion: 'rtcRegion' in channel ? channel.rtcRegion : null,
    videoQualityMode: 'videoQualityMode' in channel ? channel.videoQualityMode : null,
    defaultAutoArchiveDuration: 'defaultAutoArchiveDuration' in channel ? channel.defaultAutoArchiveDuration : null,
    defaultThreadRateLimitPerUser: 'defaultThreadRateLimitPerUser' in channel ? channel.defaultThreadRateLimitPerUser : null,
    defaultSortOrder: 'defaultSortOrder' in channel ? channel.defaultSortOrder : null,
    defaultForumLayout: 'defaultForumLayout' in channel ? channel.defaultForumLayout : null,
    defaultReactionEmoji: serializeDefaultReactionEmoji(channel.defaultReactionEmoji),
    availableTags: serializeAvailableTags(channel.availableTags),
    archivedAt: new Date().toISOString(),
    ...metadata,
  };
}

function baseChannelOptions(snapshot, channelMap = new Map(), roleMap = new Map()) {
  const parent = snapshot.parentId ? channelMap.get(snapshot.parentId) : null;
  const options = {
    name: snapshot.name,
    type: snapshot.type,
    permissionOverwrites: deserializeOverwrites(snapshot.permissionOverwrites, roleMap),
    reason: 'Raid protection structure restore',
  };

  if (parent && snapshot.type !== ChannelType.GuildCategory) {
    options.parent = parent;
  }

  if ('topic' in snapshot && snapshot.topic != null) {
    options.topic = snapshot.topic;
  }
  if ('nsfw' in snapshot && typeof snapshot.nsfw === 'boolean') {
    options.nsfw = snapshot.nsfw;
  }
  if ('rateLimitPerUser' in snapshot && snapshot.rateLimitPerUser != null) {
    options.rateLimitPerUser = snapshot.rateLimitPerUser;
  }
  if (snapshot.bitrate != null) {
    options.bitrate = snapshot.bitrate;
  }
  if (snapshot.userLimit != null) {
    options.userLimit = snapshot.userLimit;
  }
  if (snapshot.rtcRegion != null) {
    options.rtcRegion = snapshot.rtcRegion;
  }
  if (snapshot.videoQualityMode != null) {
    options.videoQualityMode = snapshot.videoQualityMode;
  }
  if (snapshot.defaultAutoArchiveDuration != null) {
    options.defaultAutoArchiveDuration = snapshot.defaultAutoArchiveDuration;
  }
  if (snapshot.defaultThreadRateLimitPerUser != null) {
    options.defaultThreadRateLimitPerUser = snapshot.defaultThreadRateLimitPerUser;
  }
  if (snapshot.defaultReactionEmoji) {
    options.defaultReactionEmoji = snapshot.defaultReactionEmoji;
  }
  if (snapshot.availableTags?.length) {
    options.availableTags = snapshot.availableTags.map(({ name, moderated, emojiId, emojiName }) => ({
      name,
      moderated,
      emoji: emojiId || emojiName ? { id: emojiId, name: emojiName } : null,
    }));
  }
  if (snapshot.defaultSortOrder != null) {
    options.defaultSortOrder = snapshot.defaultSortOrder;
  }
  if (snapshot.defaultForumLayout != null) {
    options.defaultForumLayout = snapshot.defaultForumLayout;
  }

  return options;
}

function findExistingChannel(guild, snapshot, channelMap) {
  const byId = guild.channels.cache.get(snapshot.id);
  if (byId) {
    return byId;
  }

  const parentId = snapshot.parentId ? channelMap.get(snapshot.parentId) : null;
  return guild.channels.cache.find((channel) =>
    channel.type === snapshot.type
    && channel.name === snapshot.name
    && (snapshot.type === ChannelType.GuildCategory || (channel.parentId || null) === (parentId || null))
  ) || null;
}

async function applyChannelMetadata(channel, snapshot, channelMap, roleMap, failures) {
  try {
    const editOptions = baseChannelOptions(snapshot, channelMap, roleMap);
    delete editOptions.type;
    delete editOptions.permissionOverwrites;
    delete editOptions.parent;
    delete editOptions.reason;

    if (Object.keys(editOptions).length > 0) {
      await channel.edit(editOptions, 'Raid protection channel metadata restore');
    }

    await channel.permissionOverwrites.set(
      deserializeOverwrites(snapshot.permissionOverwrites, roleMap),
      'Raid protection permission overwrite restore',
    );

    const mappedParent = snapshot.parentId ? channelMap.get(snapshot.parentId) : null;
    if (snapshot.type !== ChannelType.GuildCategory && mappedParent && channel.parentId !== mappedParent) {
      await channel.setParent(mappedParent, {
        lockPermissions: false,
        reason: 'Raid protection parent restore',
      });
    }

    if (typeof snapshot.rawPosition === 'number') {
      await channel.setPosition(snapshot.rawPosition, {
        reason: 'Raid protection channel order restore',
      });
    }
  } catch (error) {
    failures.push(`${snapshot.name}: metadata partially restored (${error.message})`);
  }
}

async function restoreChannels(guild, channelSnapshots, failures, roleMap = new Map()) {
  const channelMap = new Map();
  const sorted = [...channelSnapshots].sort((a, b) => {
    if (a.type === ChannelType.GuildCategory && b.type !== ChannelType.GuildCategory) return -1;
    if (a.type !== ChannelType.GuildCategory && b.type === ChannelType.GuildCategory) return 1;
    return (a.rawPosition ?? 0) - (b.rawPosition ?? 0);
  });

  let created = 0;
  let updated = 0;

  await runSequential(sorted, async (snapshot) => {
    try {
      let channel = findExistingChannel(guild, snapshot, channelMap);
      if (!channel) {
        const createOptions = baseChannelOptions(snapshot, channelMap, roleMap);
        try {
          channel = await guild.channels.create(createOptions);
        } catch (error) {
          if (!createOptions.permissionOverwrites?.length) {
            throw error;
          }

          failures.push(`${snapshot.name}: created without initial permission overwrites (${error.message})`);
          channel = await guild.channels.create({
            ...createOptions,
            permissionOverwrites: [],
          });
        }
        created += 1;
        logger.info(`Restored channel ${snapshot.name} (${snapshot.id}) as ${channel.id}`);
      } else {
        updated += 1;
      }

      channelMap.set(snapshot.id, channel.id);
      await applyChannelMetadata(channel, snapshot, channelMap, roleMap, failures);
    } catch (error) {
      failures.push(`${snapshot.name}: ${error.message}`);
      logger.warn(`Failed to restore channel ${snapshot.name}:`, error);
    }
  });

  return { created, updated, channelMap };
}

async function restoreRoles(guild, roleSnapshots, failures) {
  const roleMap = new Map();
  const roles = [...roleSnapshots].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  let created = 0;
  let updated = 0;

  const everyone = roles.find((role) => role.everyone);
  if (everyone) {
    try {
      await guild.roles.everyone.setPermissions(BigInt(everyone.permissions), 'Raid protection @everyone restore');
      roleMap.set(everyone.id, guild.roles.everyone.id);
      updated += 1;
    } catch (error) {
      failures.push(`@everyone permissions: ${error.message}`);
    }
  }

  await runSequential(roles.filter((role) => !role.everyone && !role.managed), async (snapshot) => {
    try {
      let role = guild.roles.cache.get(snapshot.id);
      if (!role) {
        role = guild.roles.cache.find((candidate) => !candidate.managed && candidate.name === snapshot.name) || null;
      }

      const roleData = {
        name: snapshot.name,
        permissions: BigInt(snapshot.permissions),
        color: snapshot.color,
        hoist: snapshot.hoist,
        mentionable: snapshot.mentionable,
        reason: 'Raid protection role restore',
      };

      if (role && !role.managed) {
        await role.edit(roleData);
        updated += 1;
      } else {
        role = await guild.roles.create(roleData);
        created += 1;
      }

      roleMap.set(snapshot.id, role.id);
    } catch (error) {
      failures.push(`role ${snapshot.name}: ${error.message}`);
      logger.warn(`Failed to restore role ${snapshot.name}:`, error);
    }
  });

  try {
    const positions = roles
      .filter((snapshot) => roleMap.has(snapshot.id) && !snapshot.everyone)
      .map((snapshot) => ({
        role: roleMap.get(snapshot.id),
        position: snapshot.position,
      }));

    if (positions.length > 0) {
      await guild.roles.setPositions(positions);
    }
  } catch (error) {
    failures.push(`role hierarchy: ${error.message}`);
  }

  return { created, updated, roleMap };
}

function sanitizeBackupForHash(backup) {
  return JSON.stringify({
    guildId: backup.guildId,
    createdAt: backup.createdAt,
    roles: backup.roles,
    channels: backup.channels,
  });
}

export async function createGuildBackup(client, guild) {
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  const backup = {
    version: 1,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: new Date().toISOString(),
    roles: guild.roles.cache
      .map(snapshotRole)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    channels: guild.channels.cache
      .map((channel) => snapshotChannel(channel))
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0)),
  };

  backup.hash = crypto.createHash('sha256').update(sanitizeBackupForHash(backup)).digest('hex');
  const metadata = await saveBackup(client, guild.id, backup);
  logger.info(`Saved guild backup ${backup.hash} for ${guild.name} (${guild.id})`);
  return { backup, metadata };
}

export async function restoreGuildBackup(guild, backup) {
  const failures = [];
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  const roles = await restoreRoles(guild, backup.roles || [], failures);
  const channels = await restoreChannels(guild, backup.channels || [], failures, roles.roleMap);

  return {
    rolesCreated: roles.created,
    rolesUpdated: roles.updated,
    channelsCreated: channels.created,
    channelsUpdated: channels.updated,
    failures,
  };
}

export async function botCanViewAuditLog(guild) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  return me?.permissions?.has(PermissionFlagsBits.ViewAuditLog) === true;
}

export async function fetchChannelCreatorMap(guild, channelIds, userId = null) {
  const remaining = new Set(channelIds);
  const creators = new Map();

  if (remaining.size === 0 || !(await botCanViewAuditLog(guild))) {
    return creators;
  }

  let before;
  for (let page = 0; page < CHANNEL_CREATE_AUDIT_PAGE_LIMIT && remaining.size > 0; page += 1) {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelCreate,
      limit: 100,
      before,
    }).catch((error) => {
      logger.warn(`Could not fetch channel creation audit logs for guild ${guild.id}:`, error);
      return null;
    });

    const entries = logs ? [...logs.entries.values()] : [];
    if (entries.length === 0) {
      break;
    }

    for (const entry of entries) {
      const targetId = entry.targetId || entry.target?.id;
      if (!remaining.has(targetId)) {
        continue;
      }

      if (userId && entry.executorId !== userId) {
        remaining.delete(targetId);
        continue;
      }

      creators.set(targetId, {
        userId: entry.executorId,
        tag: entry.executor?.tag || null,
        auditLogId: entry.id,
        createdAt: entry.createdAt?.toISOString?.() || null,
      });
      remaining.delete(targetId);
    }

    before = entries.at(-1)?.id;
    if (entries.length < 100 || !before) {
      break;
    }
  }

  return creators;
}

export async function recordDeletedChannelSnapshot(client, channel, metadata = {}) {
  if (!channel?.guild) {
    return null;
  }

  const creatorMap = await fetchChannelCreatorMap(channel.guild, [channel.id]);
  const creator = creatorMap.get(channel.id) || {};
  const record = {
    originalId: channel.id,
    guildId: channel.guild.id,
    createdByUserId: metadata.createdByUserId || creator.userId || null,
    createdByTag: metadata.createdByTag || creator.tag || null,
    deletedAt: new Date().toISOString(),
    deletedByUserId: metadata.deletedByUserId || null,
    status: 'deleted',
    snapshot: snapshotChannel(channel, {
      createdByUserId: metadata.createdByUserId || creator.userId || null,
      createdByTag: metadata.createdByTag || creator.tag || null,
    }),
    reason: metadata.reason || null,
  };

  await upsertDeletedChannel(client, channel.guild.id, record);
  logger.info(`Recorded deleted channel snapshot ${channel.name} (${channel.id}) in guild ${channel.guild.id}`);
  return record;
}

export async function deleteChannelsCreatedByUser(client, guild, userId, limit) {
  await guild.channels.fetch().catch(() => null);
  const channels = [...guild.channels.cache.values()];
  if (!(await botCanViewAuditLog(guild))) {
    return {
      deleted: 0,
      skipped: channels.length,
      failures: ['Bot is missing View Audit Log, so channel creators cannot be verified.'],
      auditMatches: 0,
    };
  }

  const creatorMap = await fetchChannelCreatorMap(guild, channels.map((channel) => channel.id), userId);
  const matching = channels
    .filter((channel) => creatorMap.get(channel.id)?.userId === userId)
    .sort((a, b) => {
      if (a.type === ChannelType.GuildCategory && b.type !== ChannelType.GuildCategory) return 1;
      if (a.type !== ChannelType.GuildCategory && b.type === ChannelType.GuildCategory) return -1;
      return (b.rawPosition ?? 0) - (a.rawPosition ?? 0);
    })
    .slice(0, limit);

  const failures = [];
  let deleted = 0;

  await runSequential(matching, async (channel) => {
    try {
      const creator = creatorMap.get(channel.id);
      await recordDeletedChannelSnapshot(client, channel, {
        createdByUserId: creator?.userId || userId,
        createdByTag: creator?.tag || null,
        reason: `/unnuke delete by creator ${userId}`,
      });
      await channel.delete(`Unnuke cleanup: channel created by ${userId}`);
      deleted += 1;
      logger.info(`Deleted channel ${channel.name} (${channel.id}) created by ${userId}`);
    } catch (error) {
      failures.push(`${channel.name} (${channel.id}): ${error.message}`);
      logger.warn(`Failed to delete channel ${channel.name} (${channel.id}):`, error);
    }
  });

  return {
    deleted,
    skipped: Math.max(0, channels.length - matching.length),
    failures,
    auditMatches: matching.length,
  };
}

export async function restoreDeletedChannelsForCreator(client, guild, userId) {
  const records = await getDeletedChannelsByCreator(client, guild.id, userId);
  const failures = [];

  if (records.length === 0) {
    return { restored: 0, skipped: 0, failures: ['No stored deleted-channel snapshots found for that creator.'] };
  }

  const snapshots = records.map((record) => record.snapshot);
  const result = await restoreChannels(guild, snapshots, failures);

  for (const record of records) {
    const restoredChannelId = result.channelMap.get(record.originalId);
    if (restoredChannelId) {
      await updateDeletedChannel(client, guild.id, record.originalId, {
        restoredChannelId,
        restoredAt: new Date().toISOString(),
        status: 'restored',
      });
    }
  }

  return {
    restored: result.created,
    skipped: result.updated,
    failures,
  };
}
