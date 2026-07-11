import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import {
  getHoneypotConfig,
  recordSoftban,
  saveHoneypotConfig,
} from './raidProtectionStorage.js';
import { logger } from '../utils/logger.js';

const HONEYPOT_CHANNEL_NAME = 'dont-talk-in-here';

export async function setupHoneypot(client, guild, actorId) {
  await guild.channels.fetch().catch(() => null);

  let channel = guild.channels.cache.find((candidate) =>
    candidate.type === ChannelType.GuildText
    && candidate.name === HONEYPOT_CHANNEL_NAME
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: HONEYPOT_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: `Honeypot setup requested by ${actorId}`,
    });
    logger.info(`Created honeypot channel ${channel.id} in guild ${guild.id}`);
  }

  const embed = new EmbedBuilder()
    .setTitle('Warning')
    .setColor(0xed4245)
    .setDescription([
      'This channel is monitored.',
      'Sending any message in this channel will immediately result in a softban (kick with ban-history tracking). Do not send messages here.',
    ].join('\n'));

  await channel.send({ embeds: [embed] });
  await saveHoneypotConfig(client, guild.id, {
    channelId: channel.id,
    channelName: channel.name,
    createdAt: new Date().toISOString(),
    createdByUserId: actorId,
  });

  return channel;
}

async function resolveMember(message) {
  if (message.member) {
    return message.member;
  }

  return message.guild.members.fetch(message.author.id).catch(() => null);
}

export async function handleHoneypotMessage(message, client) {
  if (!message.guild || message.author.bot) {
    return false;
  }

  const config = await getHoneypotConfig(client, message.guild.id);
  if (!config || message.channelId !== config.channelId) {
    return false;
  }

  const member = await resolveMember(message);
  if (!member) {
    logger.warn(`Honeypot message from ${message.author.id} could not resolve to a guild member`);
    return true;
  }

  const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.KickMembers)) {
    logger.warn(`Cannot softban honeypot offender ${message.author.id}; bot lacks Kick Members in guild ${message.guild.id}`);
    return true;
  }

  await message.delete().catch((error) => {
    logger.warn(`Could not delete honeypot message ${message.id}:`, error);
  });

  if (member.id === message.guild.ownerId || !member.kickable) {
    logger.warn(`Ignored honeypot offender ${member.user.tag} (${member.id}); member is not kickable by the bot`);
    return true;
  }

  const record = {
    userId: member.id,
    userTag: member.user.tag,
    guildId: message.guild.id,
    channelId: message.channelId,
    messageId: message.id,
    action: 'softban',
    createdAt: new Date().toISOString(),
    reason: `Posted in honeypot channel #${message.channel.name}`,
  };

  await recordSoftban(client, message.guild.id, record);
  await member.kick(record.reason);
  logger.info(`Softbanned honeypot offender ${member.user.tag} (${member.id}) in guild ${message.guild.id}`);
  return true;
}
