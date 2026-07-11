import { logger } from '../utils/logger.js';

export default async function loadInteractions(client) {
  client.buttons.clear();
  client.selectMenus.clear();
  client.modals.clear();
  logger.info('Legacy component interactions disabled for raid-protection mode');
}
