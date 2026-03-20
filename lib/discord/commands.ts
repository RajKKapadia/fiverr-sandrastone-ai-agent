import {
  DiscordAPIError,
  REST,
  Routes,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js"

export const ASK_COMMAND_NAME = "ask"
export const ASK_COMMAND_QUERY_OPTION_NAME = "query"

export type GuildCommandSyncResult = {
  guildId: string
  ok: boolean
  error?: string
}

export function buildAskCommand(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName(ASK_COMMAND_NAME)
    .setDescription("Ask the bot about stored knowledge.")
    .addStringOption((option) =>
      option
        .setName(ASK_COMMAND_QUERY_OPTION_NAME)
        .setDescription('Enter text like "find x".')
        .setRequired(true)
        .setMaxLength(500)
    )
    .toJSON()
}

export async function syncGuildCommands(input: {
  applicationId: string
  guildIds: Iterable<string>
  token: string
}) {
  const rest = new REST({ version: "10" }).setToken(input.token)
  const commandBody = [buildAskCommand()]
  const results: GuildCommandSyncResult[] = []

  for (const guildId of input.guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(input.applicationId, guildId),
        {
          body: commandBody,
        }
      )

      results.push({
        guildId,
        ok: true,
      })
    } catch (error) {
      const errorMessage =
        error instanceof DiscordAPIError
          ? `Discord API error ${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error)

      results.push({
        guildId,
        ok: false,
        error: errorMessage,
      })
    }
  }

  return results
}
