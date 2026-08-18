import { config } from "./config.js";

export function isAuthorized(userId: string, channelId: string): { ok: true } | { ok: false; reason: string } {
  if (!config.allowedUserIds.includes(userId)) {
    return { ok: false, reason: "You're not authorized to run coding commands on this bot." };
  }
  if (config.allowedChannelIds.length > 0 && !config.allowedChannelIds.includes(channelId)) {
    return { ok: false, reason: "This command isn't allowed in this channel." };
  }
  return { ok: true };
}
