import { AttachmentBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { buildStandardLogEmbed, formatLogLine } from './logEmbeds.js';
import { createEmbed } from './embeds.js';
import { logger } from './logger.js';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function generateTranscriptHtml(channel) {
  const messages = [];
  let before;
  let batch;
  do {
    batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
  } while (batch.size === 100);

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const rows = messages.map((msg) => {
    const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const author = escapeHtml(msg.author?.tag ?? msg.author?.username ?? 'Unknown');
    const content = escapeHtml(msg.content || (msg.embeds.length ? '[embed]' : '[attachment]'));
    return `<tr><td class="ts">${ts}</td><td class="author">${author}</td><td class="msg">${content}</td></tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript – #${escapeHtml(channel.name)}</title>
<style>
body{font-family:sans-serif;background:#36393f;color:#dcddde;margin:0;padding:16px}
h1{color:#fff;font-size:1.2rem;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{background:#2f3136;color:#8e9297;padding:6px 8px;text-align:left;border-bottom:2px solid #202225}
td{padding:4px 8px;border-bottom:1px solid #40444b;vertical-align:top}
.ts{color:#72767d;white-space:nowrap;width:160px}
.author{color:#7289da;white-space:nowrap;width:160px}
.msg{word-break:break-word}
</style>
</head>
<body>
<h1>📜 Transcript – #${escapeHtml(channel.name)}</h1>
<p style="color:#72767d">${messages.length} message(s) exported on ${new Date().toUTCString()}</p>
<table>
<thead><tr><th>Timestamp (UTC)</th><th>Author</th><th>Message</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;

  const buffer = Buffer.from(html, 'utf8');
  return new AttachmentBuilder(buffer, { name: `transcript-${channel.id}.html` });
}

export async function sendTranscriptToLogChannel(client, guildId, channel, ticketData, closedBy) {
  try {
    const attachment = await generateTranscriptHtml(channel);
    if (!attachment) return;

    const guildConfig = await getGuildConfig(client, guildId);
    const logChannelId = guildConfig.ticketTranscriptChannelId;
    if (!logChannelId) return;

    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel?.isSendable()) return;

    const openedAt = ticketData.createdAt ? new Date(ticketData.createdAt) : null;
    const duration = openedAt
      ? `${Math.round((Date.now() - openedAt.getTime()) / 60000)} minutes`
      : 'unknown';

    const transcriptEmbed = buildStandardLogEmbed({
      color: 0x3498db,
      title: 'Ticket Closed — Transcript',
      description: [
        formatLogLine('Channel', `#${channel.name}`),
        formatLogLine('Opened by', `<@${ticketData.userId}>`),
        formatLogLine('Closed by', closedBy.toString()),
        formatLogLine('Duration', duration),
        formatLogLine('Messages', `${attachment.name}`),
      ].join('\n'),
      footer: { text: `Ticket ID: ${ticketData.id}` },
      timestamp: true,
    });

    await logChannel.send({ embeds: [transcriptEmbed], files: [attachment] });
    logger.info('Transcript sent to log channel', { guildId, channelId: channel.id, logChannelId });
  } catch (error) {
    logger.error('Failed to send transcript to log channel:', { guildId, channelId: channel?.id, error: error.message });
  }
}
