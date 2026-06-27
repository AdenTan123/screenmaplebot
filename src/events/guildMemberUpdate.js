import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getWelcomeConfig } from '../utils/database.js'; // 💡 Added import for auto-role lookup

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;
      const { guild, client } = newMember;

      // ==========================================
      // 1. LOG NICKNAME CHANGES
      // ==========================================
      if (oldMember.nickname !== newMember.nickname) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Before:** ${oldMember.nickname || '*(no nickname)*'}`,
              `**After:** ${newMember.nickname || '*(no nickname)*'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.user.id,
          }
        });

        return;
      }

      // ==========================================
      // 2. CONDITIONAL AUTO-ROLE TRIGGER (hasrole)
      // ==========================================
      // Only check if their roles have actually changed
      if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        const config = await getWelcomeConfig(client, guild.id);
        
        if (config && config.conditionalRoles) {
          const { requiredId, assignId } = config.conditionalRoles;

          const hadRoleBefore = oldMember.roles.cache.has(requiredId);
          const hasRoleNow = newMember.roles.cache.has(requiredId);
          const alreadyHasAssignRole = newMember.roles.cache.has(assignId);

          // If they just gained the required role and don't already have the target assignment role
          if (hasRoleNow && !hadRoleBefore && !alreadyHasAssignRole) {
            const targetRole = guild.roles.cache.get(assignId);
            
            if (!targetRole) {
              logger.warn(`[AutoRole Event] Target assign role ${assignId} not found in guild ${guild.name}`);
              return;
            }

            // Hierarchy Guard: Bot must be placed higher than the role it's trying to give
            if (targetRole.position >= guild.members.me.roles.highest.position) {
              logger.warn(`[AutoRole Event] Cannot assign ${targetRole.name} because it is higher than the bot's hierarchy in ${guild.name}`);
              return;
            }

            // Assign the role!
            await newMember.roles.add(assignId);
            logger.info(`[AutoRole Event] Automatically assigned ${targetRole.name} to ${newMember.user.tag} because they gained the required base role.`);
          }
        }
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};