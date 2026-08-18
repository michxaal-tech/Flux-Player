import { ChatInputCommandInteraction } from "discord.js";
import { isAuthorized } from "../security.js";
import { runClaudeTask } from "../claude.js";

const DISCORD_MESSAGE_LIMIT = 2000;
const EDIT_THROTTLE_MS = 1500;

export async function handleCodeCommand(interaction: ChatInputCommandInteraction) {
  const auth = isAuthorized(interaction.user.id, interaction.channelId);
  if (!auth.ok) {
    await interaction.reply({ content: auth.reason, ephemeral: true });
    return;
  }

  const prompt = interaction.options.getString("prompt", true);
  await interaction.deferReply();

  const progressLines: string[] = [];
  let lastEdit = 0;
  let editPending = false;

  const flush = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastEdit < EDIT_THROTTLE_MS) return;
    if (editPending) return;
    editPending = true;
    lastEdit = now;
    const body = `**Working on:** ${prompt}\n\n${formatProgress(progressLines)}`;
    try {
      await interaction.editReply(truncate(body, DISCORD_MESSAGE_LIMIT));
    } finally {
      editPending = false;
    }
  };

  try {
    const result = await runClaudeTask(prompt, (line) => {
      progressLines.push(line);
      void flush();
    });

    await flush(true);
    await sendChunked(interaction, `**Done.**\n\n${result || "(no output)"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sendChunked(interaction, `**Failed:** ${message}`);
  }
}

function formatProgress(lines: string[]): string {
  const recent = lines.slice(-15);
  return recent.join("\n");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function sendChunked(interaction: ChatInputCommandInteraction, text: string) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += DISCORD_MESSAGE_LIMIT) {
    chunks.push(text.slice(i, i + DISCORD_MESSAGE_LIMIT));
  }
  if (chunks.length === 0) chunks.push("(empty)");

  await interaction.editReply(chunks[0]);
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp(chunk);
  }
}
