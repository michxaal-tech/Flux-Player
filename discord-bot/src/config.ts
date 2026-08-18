import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function csv(name: string): string[] {
  const value = process.env[name];
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordGuildId: process.env.DISCORD_GUILD_ID || undefined,

  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  model: process.env.CLAUDE_MODEL || "claude-sonnet-5",

  // The single directory Claude is allowed to read/write/run commands in.
  // Point this at a checkout of whatever repo you want the bot to operate on.
  workspaceDir: path.resolve(required("WORKSPACE_DIR")),

  // Only these Discord user IDs may invoke coding commands.
  allowedUserIds: csv("ALLOWED_USER_IDS"),
  // If set, coding commands only work inside these channel IDs.
  allowedChannelIds: csv("ALLOWED_CHANNEL_IDS"),

  allowedTools: csv("ALLOWED_TOOLS").length
    ? csv("ALLOWED_TOOLS")
    : ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
};

if (config.allowedUserIds.length === 0) {
  throw new Error(
    "ALLOWED_USER_IDS is empty. Refusing to start: this bot runs shell commands on your " +
      "behalf, so it must not be usable by arbitrary Discord users. Set ALLOWED_USER_IDS " +
      "to a comma-separated list of Discord user IDs allowed to use it."
  );
}
