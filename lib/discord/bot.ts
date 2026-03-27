import "dotenv/config"

import path from "node:path"
import { fileURLToPath } from "node:url"

import { Client, Events, GatewayIntentBits } from "discord.js"

import { serverEnv } from "@/data/env/server"

import { clearGuildCommands } from "./commands"
import { registerDiscordHandlers } from "./handlers"

function requireNonEmptyValue(name: string, value: string) {
  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`${name} is required to run the Discord bot.`)
  }

  return normalized
}

function parseAllowedDiscordIds(name: string, value: string, label: string) {
  const ids = new Set(
    value
      .split(/[,\n]+/)
      .map((id) => id.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
  )

  if (ids.size === 0) {
    throw new Error(`${name} must include at least one ${label} ID.`)
  }

  const invalidIds = [...ids].filter((id) => !/^\d{17,20}$/.test(id))

  if (invalidIds.length > 0) {
    throw new Error(
      `${name} contains invalid ${label} IDs: ${invalidIds.join(", ")}`
    )
  }

  return ids
}

async function stopDiscordBot(client: Client) {
  client.removeAllListeners()
  client.destroy()
}

function registerShutdownHandlers(client: Client) {
  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`[Discord] Received ${signal}, shutting down.`)
    await stopDiscordBot(client)
    process.exit(0)
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT")
  })

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM")
  })
}

export async function startDiscordBot() {
  const token = requireNonEmptyValue(
    "DISCORD_BOT_TOKEN",
    serverEnv.DISCORD_BOT_TOKEN
  )
  const applicationId = requireNonEmptyValue(
    "DISCORD_APPLICATION_ID",
    serverEnv.DISCORD_APPLICATION_ID
  )
  const allowedGuildIds = parseAllowedDiscordIds(
    "DISCORD_ALLOWED_GUILD_IDS",
    serverEnv.DISCORD_ALLOWED_GUILD_IDS,
    "guild"
  )
  const allowedChannelIds = parseAllowedDiscordIds(
    "DISCORD_ALLOWED_CHANNEL_IDS",
    serverEnv.DISCORD_ALLOWED_CHANNEL_IDS,
    "channel"
  )
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  registerDiscordHandlers(client, { allowedChannelIds, allowedGuildIds })
  registerShutdownHandlers(client)

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[Discord] Connected as ${readyClient.user.tag}`)

    try {
      const connectedApplication = await readyClient.application.fetch()
      const joinedGuildIds = [...readyClient.guilds.cache.keys()]

      console.log("[Discord] Startup context", {
        allowedChannelIds: [...allowedChannelIds],
        allowedGuildIds: [...allowedGuildIds],
        applicationId,
        connectedApplicationId: connectedApplication.id,
        joinedGuildIds,
      })

      const commandResults = await clearGuildCommands({
        applicationId,
        guildIds: allowedGuildIds,
        token,
      })
      const failedResults = commandResults.filter((result) => !result.ok)

      for (const result of commandResults) {
        if (result.ok) {
          console.log("[Discord] Cleared guild commands", {
            guildId: result.guildId,
          })
          continue
        }

        console.error("[Discord] Failed to clear guild commands", {
          guildId: result.guildId,
          error: result.error,
          botInGuild: readyClient.guilds.cache.has(result.guildId),
        })
      }

      if (connectedApplication.id !== applicationId) {
        throw new Error(
          `DISCORD_APPLICATION_ID (${applicationId}) does not match the connected application (${connectedApplication.id}).`
        )
      }

      if (failedResults.length > 0) {
        throw new Error(
          `Failed to clear commands for ${failedResults.length} guild(s).`
        )
      }

      console.log(
        `[Discord] Cleared guild commands for ${allowedGuildIds.size} guild(s).`
      )
    } catch (error) {
      console.error("[Discord] Failed to clear guild commands", {
        error: error instanceof Error ? error.message : String(error),
      })
      await stopDiscordBot(client)
      process.exit(1)
    }
  })

  client.on(Events.Error, (error) => {
    console.error("[Discord] Client error", {
      error: error.message,
    })
  })

  await client.login(token)

  return client
}

const currentFilePath = fileURLToPath(import.meta.url)
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (entryFilePath === currentFilePath) {
  void startDiscordBot().catch((error) => {
    console.error("[Discord] Bot startup failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
}
