import {
  DiscordAPIError,
  REST,
  Routes,
} from "discord.js"

export type GuildCommandUpdateResult = {
  guildId: string
  ok: boolean
  error?: string
}

export async function clearGuildCommands(input: {
  applicationId: string
  guildIds: Iterable<string>
  token: string
}) {
  const rest = new REST({ version: "10" }).setToken(input.token)
  const results: GuildCommandUpdateResult[] = []

  for (const guildId of input.guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(input.applicationId, guildId),
        {
          body: [],
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
