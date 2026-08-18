import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { handleCodeCommand } from "./commands/code.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}. Workspace: ${config.workspaceDir}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "code") {
    try {
      await handleCodeCommand(interaction);
    } catch (err) {
      console.error("Unhandled error in /code:", err);
    }
  }
});

client.login(config.discordToken);
