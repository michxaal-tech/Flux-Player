import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "./config.js";

const commands = [
  new SlashCommandBuilder()
    .setName("code")
    .setDescription("Ask Claude to work on the configured repo")
    .addStringOption((opt) =>
      opt
        .setName("prompt")
        .setDescription("What you want Claude to do")
        .setRequired(true)
    ),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.discordToken);

async function main() {
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);

  await rest.put(route, { body: commands });

  console.log(
    config.discordGuildId
      ? `Registered /code for guild ${config.discordGuildId} (instant).`
      : "Registered /code globally (can take up to an hour to propagate)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
