// xpSystem.js
// Leveling system has been removed. This is a stub to prevent import errors.

import { logger } from '../utils/logger.js';

export async function addXp(client, guild, member, xpToAdd) {
  logger.debug('XP system is disabled — leveling service was removed.');
  return { success: false, reason: 'Leveling system is disabled' };
}