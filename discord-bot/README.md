# claude-discord-bot

A Discord bot with one slash command, `/code <prompt>`, that runs a Claude Code
agent (via the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript))
against a single repo checkout on the bot's host. The agent can read/write files
and run shell commands (git, npm, tests, etc.) inside that one directory, and
streams its progress back into the Discord channel as it works.

## What it can and can't do

- It operates on **one directory** (`WORKSPACE_DIR`). Claude cannot read, write,
  or run commands outside it.
- It only accepts commands from Discord **user IDs you explicitly allowlist**
  (`ALLOWED_USER_IDS`). The bot refuses to start without this set.
- File edits and shell commands run **without interactive approval** — there's
  no human at a terminal to click "yes". The allowlist + workspace confinement
  above is what keeps this safe, not a permission prompt. Don't point
  `WORKSPACE_DIR` at anything you're not comfortable an LLM running `rm`, `git
  push`, `npm install`, etc. inside of.
- Git pushes, PR creation, etc. only happen if the workspace has credentials
  configured for them (e.g. an SSH key or a `GH_TOKEN`/git credential helper)
  and the prompt asks for it — the bot itself doesn't push anything on its own.

## Setup

### 1. Create the Discord application

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token**, copy it → `DISCORD_TOKEN`.
3. **OAuth2 → General**, copy the **Client ID** → `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`,
   permissions `Send Messages`, `Read Message History`. Open the generated
   URL to invite the bot to your server.
5. Your Discord user ID (right-click your name → Copy User ID, with Developer
   Mode on in Discord settings) → `ALLOWED_USER_IDS`.

### 2. Get an Anthropic API key

https://platform.claude.com/ → API keys. This is billed separately from a
Claude.ai subscription.

### 3. Point it at a repo

Clone (or otherwise check out) the repo you want the bot to work on somewhere
on the host, and set `WORKSPACE_DIR` to that path.

### 4. Configure

```bash
cp .env.example .env
# fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, ANTHROPIC_API_KEY,
# WORKSPACE_DIR, ALLOWED_USER_IDS
```

Set `DISCORD_GUILD_ID` too while testing — guild-scoped commands register
instantly, global ones take up to an hour.

### 5. Run it

**Plain Node (free, simplest):**

```bash
npm install
npm run register-commands   # registers /code, run again if you change it
npm run dev                 # or: npm run build && npm start
```

**Docker (isolated, easy to reset):**

```bash
mkdir -p workspace && git clone <your-repo-url> workspace
# .env: set WORKSPACE_DIR=/workspace (matches the compose mount)
docker compose up --build -d
docker compose run --rm claude-discord-bot npm run register-commands
```

## Usage

In your server: `/code prompt: add a loading spinner to the login button`

The bot posts a "Working on:" message, edits it with tool-call progress
(`→ Read src/App.tsx`, `→ Bash npm test`, …), then posts the final result.
Long output is split across follow-up messages (Discord's 2000-char limit).

## Extending

- Multiple repos: add a `repo` option to `/code`, resolve it to one of a few
  pre-approved `WORKSPACE_DIR`s server-side — don't let the prompt itself
  pick an arbitrary path.
- Tighter sandboxing: run the bot itself inside a container/VM with no access
  to anything beyond the mounted workspace, so even a `Bash` tool call has
  nothing sensitive to reach.
- See `src/claude.ts` for the tool allowlist and permission mode, and
  `src/security.ts` for the user/channel allowlist.
