import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";

export type ProgressHandler = (line: string) => void;

function summarizeToolInput(name: string, input: unknown): string {
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === "string") return `\`${truncate(obj.command, 120)}\``;
    if (typeof obj.file_path === "string") return `\`${obj.file_path}\``;
    if (typeof obj.path === "string") return `\`${obj.path}\``;
    if (typeof obj.pattern === "string") return `\`${obj.pattern}\``;
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Runs one Claude Code agent task against the configured workspace directory.
 * Tools and cwd are pinned in config so the agent can never leave the sandboxed
 * workspace or use tools outside the allowlist, regardless of what the prompt asks.
 */
export async function runClaudeTask(
  prompt: string,
  onProgress: ProgressHandler
): Promise<string> {
  let finalResult = "";
  let sawError = false;

  for await (const message of query({
    prompt,
    options: {
      cwd: config.workspaceDir,
      allowedTools: config.allowedTools,
      // Headless bot: nobody is watching a TTY to approve prompts, so edits and
      // tool calls within the allowlist run without interactive confirmation.
      // The workspace confinement + tool allowlist above is what keeps this safe,
      // not a human clicking "yes" — see discord-bot/README.md before deploying.
      permissionMode: "acceptEdits",
      model: config.model,
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          const detail = summarizeToolInput(block.name, block.input);
          onProgress(`→ ${block.name}${detail ? ` ${detail}` : ""}`);
        }
      }
    } else if (message.type === "result") {
      sawError = message.subtype !== "success";
      finalResult = message.result ?? "";
    }
  }

  if (sawError) {
    throw new Error(finalResult || "Claude task ended without a successful result.");
  }
  return finalResult;
}
