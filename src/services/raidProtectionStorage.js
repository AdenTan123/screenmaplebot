import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const STORE_PATH = path.join(process.cwd(), 'data', 'raid-protection-store.json');
let fileWriteLock = Promise.resolve();

async function readFileStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    logger.warn('Failed to read raid-protection file store:', error);
    return {};
  }
}

async function writeFileStore(store) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

async function getValue(client, key, defaultValue) {
  if (client.db?.initialized) {
    const value = await client.db.get(key, undefined);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  const store = await readFileStore();
  return store[key] ?? defaultValue;
}

async function setValue(client, key, value) {
  if (client.db?.initialized) {
    const saved = await client.db.set(key, value);
    if (saved) {
      return true;
    }
  }

  fileWriteLock = fileWriteLock.then(async () => {
    const store = await readFileStore();
    store[key] = value;
    await writeFileStore(store);
  });

  await fileWriteLock;
  return true;
}

function backupIndexKey(guildId) {
  return `raid:backups:${guildId}:index`;
}

function backupKey(guildId, hash) {
  return `raid:backups:${guildId}:${hash}`;
}

function deletedChannelsKey(guildId) {
  return `raid:deletedChannels:${guildId}`;
}

function honeypotKey(guildId) {
  return `raid:honeypot:${guildId}`;
}

function softbansKey(guildId) {
  return `raid:softbans:${guildId}`;
}

export async function saveBackup(client, guildId, backup) {
  const index = await listBackups(client, guildId);
  const compact = {
    hash: backup.hash,
    createdAt: backup.createdAt,
    guildName: backup.guildName,
    channelCount: backup.channels.length,
    roleCount: backup.roles.length,
    sizeBytes: Buffer.byteLength(JSON.stringify(backup), 'utf8'),
  };

  const nextIndex = [compact, ...index.filter((entry) => entry.hash !== backup.hash)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  await setValue(client, backupKey(guildId, backup.hash), backup);
  await setValue(client, backupIndexKey(guildId), nextIndex);
  return compact;
}

export async function listBackups(client, guildId) {
  return getValue(client, backupIndexKey(guildId), []);
}

export async function getBackup(client, guildId, hashOrLatest) {
  const index = await listBackups(client, guildId);
  const needle = String(hashOrLatest || '').toLowerCase();
  const entry = needle === 'latest'
    ? index[0]
    : index.find((item) => item.hash.toLowerCase() === needle)
      || index.find((item) => item.hash.toLowerCase().startsWith(needle));

  if (!entry) {
    return null;
  }

  return getValue(client, backupKey(guildId, entry.hash), null);
}

export async function upsertDeletedChannel(client, guildId, record) {
  const records = await getDeletedChannels(client, guildId);
  const existing = records.find((item) => item.originalId === record.originalId);
  const mergedRecord = existing
    ? {
        ...existing,
        ...record,
        createdByUserId: record.createdByUserId || existing.createdByUserId,
        createdByTag: record.createdByTag || existing.createdByTag,
      }
    : record;
  const next = [
    mergedRecord,
    ...records.filter((item) => item.originalId !== record.originalId),
  ];
  await setValue(client, deletedChannelsKey(guildId), next);
  return mergedRecord;
}

export async function updateDeletedChannel(client, guildId, originalId, patch) {
  const records = await getDeletedChannels(client, guildId);
  const next = records.map((record) => (
    record.originalId === originalId ? { ...record, ...patch } : record
  ));
  await setValue(client, deletedChannelsKey(guildId), next);
}

export async function getDeletedChannels(client, guildId) {
  return getValue(client, deletedChannelsKey(guildId), []);
}

export async function getDeletedChannelsByCreator(client, guildId, userId) {
  const records = await getDeletedChannels(client, guildId);
  return records.filter((record) =>
    record.createdByUserId === userId
    && record.status === 'deleted'
    && !record.restoredChannelId
  );
}

export async function saveHoneypotConfig(client, guildId, config) {
  await setValue(client, honeypotKey(guildId), config);
  return config;
}

export async function getHoneypotConfig(client, guildId) {
  return getValue(client, honeypotKey(guildId), null);
}

export async function recordSoftban(client, guildId, record) {
  const records = await getValue(client, softbansKey(guildId), []);
  await setValue(client, softbansKey(guildId), [record, ...records].slice(0, 1000));
  return record;
}
