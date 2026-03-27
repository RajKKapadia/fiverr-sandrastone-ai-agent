import { run, InputGuardrailTripwireTriggered } from "@openai/agents"
import {
  PermissionFlagsBits,
  type Client,
  type MessageCreateOptions,
  type Message,
} from "discord.js"

import { primaryAgent } from "@/lib/agent"
import { generateOutOfScopeResponse } from "@/lib/agent/out-of-scope"
import type { UserContext } from "@/lib/types"

const AGENT_TIMEOUT_MS = 30_000
const DISCORD_MESSAGE_LIMIT = 2_000
const MAX_QUERY_LENGTH = DISCORD_MESSAGE_LIMIT
const REQUEST_COOLDOWN_MS = 10_000
const inFlightRequests = new Set<string>()
const lastRequestAtByUser = new Map<string, number>()

type DiscordHandlerOptions = {
  allowedChannelIds: Set<string>
  allowedGuildIds: Set<string>
}

function sanitizeDiscordContent(value: string) {
  return value
    .replace(/@everyone/g, "@\u200beveryone")
    .replace(/@here/g, "@\u200bhere")
    .trim()
}

function truncateDiscordContent(value: string) {
  if (value.length <= DISCORD_MESSAGE_LIMIT) {
    return value
  }

  return `${value.slice(0, DISCORD_MESSAGE_LIMIT - 3).trimEnd()}...`
}

function formatDiscordResponse(value: string) {
  const normalized = sanitizeDiscordContent(value)

  if (!normalized) {
    return "I could not generate a response for that request."
  }

  return truncateDiscordContent(normalized)
}

function buildMessageOptions(content: string): MessageCreateOptions {
  return {
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
    content,
  }
}

function isAllowedGuild(guildId: string | null, allowedGuildIds: Set<string>) {
  return Boolean(guildId && allowedGuildIds.has(guildId))
}

function isAllowedChannel(
  channelId: string | null,
  allowedChannelIds: Set<string>
) {
  return Boolean(channelId && allowedChannelIds.has(channelId))
}

function normalizeQuery(value: string) {
  return value.trim()
}

function getRequestKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`
}

function getCooldownMessage(key: string) {
  if (inFlightRequests.has(key)) {
    return "I am still working on your previous request. Please wait for that response first."
  }

  const lastRequestAt = lastRequestAtByUser.get(key)

  if (!lastRequestAt) {
    return null
  }

  if (Date.now() - lastRequestAt < REQUEST_COOLDOWN_MS) {
    return "Please wait a few seconds before sending another request."
  }

  return null
}

function beginRequest(key: string) {
  inFlightRequests.add(key)
  lastRequestAtByUser.set(key, Date.now())
}

function endRequest(key: string) {
  inFlightRequests.delete(key)
}

function buildUserContext(input: {
  userId: string
  username: string
}): UserContext {
  return {
    channelType: "discord",
    userId: input.userId,
    username: input.username,
  }
}

function getDiscordUsername(message: Message) {
  return (
    message.member?.displayName ||
    message.author.globalName ||
    message.author.username
  )
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("timed out"))
  )
}

function getMissingChannelPermissions(message: Message) {
  if (!message.inGuild()) {
    return [] as string[]
  }

  const currentMember = message.guild.members.me

  if (!currentMember) {
    return [] as string[]
  }

  const permissions = message.channel.permissionsFor(currentMember)

  if (!permissions) {
    return [] as string[]
  }

  const missingPermissions: string[] = []

  if (!permissions.has(PermissionFlagsBits.ViewChannel, true)) {
    missingPermissions.push("ViewChannel")
  }

  if (message.channel.isThread()) {
    if (!permissions.has(PermissionFlagsBits.SendMessagesInThreads, true)) {
      missingPermissions.push("SendMessagesInThreads")
    }
  } else if (!permissions.has(PermissionFlagsBits.SendMessages, true)) {
    missingPermissions.push("SendMessages")
  }

  if (!permissions.has(PermissionFlagsBits.ReadMessageHistory, true)) {
    missingPermissions.push("ReadMessageHistory")
  }

  return missingPermissions
}

async function sendDiscordResponse(message: Message, content: string) {
  try {
    await message.reply(buildMessageOptions(content))
    return
  } catch (error) {
    console.warn("[Discord] Direct reply failed", {
      channelId: message.channelId,
      error: error instanceof Error ? error.message : String(error),
      guildId: message.guildId,
      missingPermissions: getMissingChannelPermissions(message),
      userId: message.author.id,
    })

    throw error
  }
}

async function runDiscordAsk(input: {
  query: string
  userContext: UserContext
}) {
  const query = normalizeQuery(input.query)

  if (!query) {
    return "Please send a non-empty question."
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return `Please keep your request under ${MAX_QUERY_LENGTH} characters.`
  }

  try {
    const result = await run(primaryAgent, query, {
      context: input.userContext,
      maxTurns: 8,
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    })

    const finalOutput =
      typeof result.finalOutput === "string" ? result.finalOutput.trim() : ""
    return formatDiscordResponse(finalOutput)
  } catch (error) {
    if (error instanceof InputGuardrailTripwireTriggered) {
      const response = await generateOutOfScopeResponse({
        message: query,
        userContext: input.userContext,
      })

      return formatDiscordResponse(response)
    }
    throw error
  }
}

async function handleChannelMessage(
  message: Message,
  options: DiscordHandlerOptions
) {
  if (
    !message.inGuild() ||
    !isAllowedGuild(message.guildId, options.allowedGuildIds) ||
    !isAllowedChannel(message.channelId, options.allowedChannelIds)
  ) {
    return
  }

  if (message.author.bot || message.webhookId) {
    return
  }

  const query = message.content.trim()

  if (!query) {
    return
  }

  const requestKey = getRequestKey(message.guildId, message.author.id)
  const cooldownMessage = getCooldownMessage(requestKey)

  if (cooldownMessage) {
    await sendDiscordResponse(message, cooldownMessage)
    return
  }

  beginRequest(requestKey)

  try {
    const response = await runDiscordAsk({
      query,
      userContext: buildUserContext({
        userId: message.author.id,
        username: getDiscordUsername(message),
      }),
    })

    await sendDiscordResponse(message, response)
  } catch (error) {
    console.error("[Discord] Message request failed", {
      channelId: message.channelId,
      error: error instanceof Error ? error.message : String(error),
      guildId: message.guildId,
      missingPermissions: getMissingChannelPermissions(message),
      userId: message.author.id,
    })

    const failureMessage = isTimeoutError(error)
      ? "That request timed out. Please try again."
      : "Something went wrong while processing that request."

    await sendDiscordResponse(message, failureMessage).catch(() => undefined)
  } finally {
    endRequest(requestKey)
  }
}

export function registerDiscordHandlers(
  client: Client,
  options: DiscordHandlerOptions
) {
  client.on("messageCreate", (message) => {
    void handleChannelMessage(message, options)
  })
}
