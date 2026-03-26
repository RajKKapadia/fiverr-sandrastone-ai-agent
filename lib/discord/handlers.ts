import { run, InputGuardrailTripwireTriggered } from "@openai/agents"
import {
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type InteractionEditReplyOptions,
  type MessageCreateOptions,
  type Message,
} from "discord.js"

import { primaryAgent } from "@/lib/agent"
import { generateOutOfScopeResponse } from "@/lib/agent/out-of-scope"
import type { UserContext } from "@/lib/types"

import {
  ASK_COMMAND_NAME,
  ASK_COMMAND_QUERY_OPTION_NAME,
} from "./commands"

const AGENT_TIMEOUT_MS = 30_000
const DISCORD_MESSAGE_LIMIT = 2_000
const MAX_QUERY_LENGTH = 500
const REQUEST_COOLDOWN_MS = 10_000
const inFlightRequests = new Set<string>()
const lastRequestAtByUser = new Map<string, number>()

type DiscordHandlerOptions = {
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

function buildInteractionReplyOptions(
  content: string
): InteractionEditReplyOptions {
  return {
    allowedMentions: {
      parse: [],
    },
    content,
  }
}

function isAllowedGuild(guildId: string | null, allowedGuildIds: Set<string>) {
  return Boolean(guildId && allowedGuildIds.has(guildId))
}

function normalizeQuery(value: string) {
  return value.trim().replace(/^[,:-]+\s*/, "")
}

function extractMentionQuery(message: Message, botUserId: string) {
  if (!message.mentions.users.has(botUserId)) {
    return null
  }

  const content = message.content.trim()

  if (!content) {
    return ""
  }

  const leadingMentionPattern = new RegExp(`^\\s*<@!?${botUserId}>(?:\\s|$)`)

  if (leadingMentionPattern.test(content)) {
    return normalizeQuery(content.replace(leadingMentionPattern, " "))
  }

  const inlineMentionPattern = new RegExp(`<@!?${botUserId}>`, "g")
  return normalizeQuery(content.replace(inlineMentionPattern, " "))
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

function getInteractionUsername(interaction: ChatInputCommandInteraction) {
  return interaction.user.globalName || interaction.user.username
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

async function sendMentionResponse(message: Message, content: string) {
  const options = buildMessageOptions(content)

  try {
    await message.reply(options)
    return
  } catch (error) {
    console.warn("[Discord] Inline reply failed, falling back to channel send", {
      channelId: message.channelId,
      error: error instanceof Error ? error.message : String(error),
      guildId: message.guildId,
      missingPermissions: getMissingChannelPermissions(message),
      userId: message.author.id,
    })
  }

  if (!message.channel.isSendable()) {
    throw new Error("Discord channel is not sendable.")
  }

  await message.channel.send(options)
}

async function runDiscordAsk(input: {
  query: string
  userContext: UserContext
}) {
  const query = normalizeQuery(input.query)

  if (!query) {
    return "Mention me with a question, for example `@bot find the refund policy`."
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

async function handleMentionRequest(message: Message, options: DiscordHandlerOptions) {
  if (!message.inGuild() || !isAllowedGuild(message.guildId, options.allowedGuildIds)) {
    return
  }

  if (message.author.bot || message.webhookId) {
    return
  }

  const botUserId = message.client.user?.id

  if (!botUserId) {
    return
  }

  const query = extractMentionQuery(message, botUserId)

  if (query === null) {
    return
  }

  const requestKey = getRequestKey(message.guildId, message.author.id)
  const cooldownMessage = getCooldownMessage(requestKey)

  if (cooldownMessage) {
    await sendMentionResponse(message, cooldownMessage)
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

    await sendMentionResponse(message, response)
  } catch (error) {
    console.error("[Discord] Mention request failed", {
      channelId: message.channelId,
      error: error instanceof Error ? error.message : String(error),
      guildId: message.guildId,
      missingPermissions: getMissingChannelPermissions(message),
      userId: message.author.id,
    })

    const failureMessage = isTimeoutError(error)
      ? "That request timed out. Please try again."
      : "Something went wrong while processing that request."

    await sendMentionResponse(message, failureMessage).catch(() => undefined)
  } finally {
    endRequest(requestKey)
  }
}

async function handleAskInteraction(
  interaction: ChatInputCommandInteraction,
  options: DiscordHandlerOptions
) {
  if (!interaction.inCachedGuild()) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: "This command can only be used in allowed server channels.",
        flags: MessageFlags.Ephemeral,
      })
    }
    return
  }

  if (!isAllowedGuild(interaction.guildId, options.allowedGuildIds)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: "This command is not available in this server.",
        flags: MessageFlags.Ephemeral,
      })
    }
    return
  }

  const requestKey = getRequestKey(interaction.guildId, interaction.user.id)
  const cooldownMessage = getCooldownMessage(requestKey)

  if (cooldownMessage) {
    await interaction.reply({
      content: cooldownMessage,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  beginRequest(requestKey)

  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    })

    const query =
      interaction.options.getString(ASK_COMMAND_QUERY_OPTION_NAME, true) || ""
    const response = await runDiscordAsk({
      query,
      userContext: buildUserContext({
        userId: interaction.user.id,
        username: getInteractionUsername(interaction),
      }),
    })

    await interaction.editReply(buildInteractionReplyOptions(response))
  } catch (error) {
    console.error("[Discord] Slash request failed", {
      error: error instanceof Error ? error.message : String(error),
      guildId: interaction.guildId,
      userId: interaction.user.id,
    })

    const failureMessage = isTimeoutError(error)
      ? "That request timed out. Please try again."
      : "Something went wrong while processing that request."

    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply(buildInteractionReplyOptions(failureMessage))
        .catch(() => undefined)
    } else {
      await interaction
        .reply({
          content: failureMessage,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => undefined)
    }
  } finally {
    endRequest(requestKey)
  }
}

export function registerDiscordHandlers(
  client: Client,
  options: DiscordHandlerOptions
) {
  client.on("messageCreate", (message) => {
    void handleMentionRequest(message, options)
  })

  client.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    if (interaction.commandName !== ASK_COMMAND_NAME) {
      return
    }

    void handleAskInteraction(interaction, options)
  })
}
