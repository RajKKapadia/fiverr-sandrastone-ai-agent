import type { AgentInputItem } from "@openai/agents"

import type { WidgetChatHistoryEntry, WidgetMessage } from "./types"

function isMessageLikeItem(item: AgentInputItem): item is AgentInputItem & {
  content: unknown
  id?: string
  role: "assistant" | "system" | "user"
} {
  return (
    typeof item === "object" &&
    item !== null &&
    "role" in item &&
    typeof item.role === "string"
  )
}

function extractTextFromArray(content: unknown[]) {
  return content
    .map((entry) => {
      if (!entry || typeof entry !== "object" || !("type" in entry)) {
        return null
      }

      if (
        entry.type === "input_text" &&
        "text" in entry &&
        typeof entry.text === "string"
      ) {
        return entry.text
      }

      if (
        entry.type === "output_text" &&
        "text" in entry &&
        typeof entry.text === "string"
      ) {
        return entry.text
      }

      if (
        entry.type === "refusal" &&
        "refusal" in entry &&
        typeof entry.refusal === "string"
      ) {
        return entry.refusal
      }

      if (
        entry.type === "audio" &&
        "transcript" in entry &&
        typeof entry.transcript === "string"
      ) {
        return entry.transcript
      }

      return null
    })
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n")
    .trim()
}

function extractMessageText(content: unknown) {
  if (typeof content === "string") {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return extractTextFromArray(content)
  }

  return ""
}

export function mapWidgetMessagesToAgentItems(
  messages: WidgetChatHistoryEntry[]
): AgentInputItem[] {
  return messages.reduce<AgentInputItem[]>((items, message) => {
    const content = message.content.trim()

    if (!content) {
      return items
    }

    if (message.role === "user") {
      items.push({
        content,
        role: "user",
      } satisfies AgentInputItem)
      return items
    }

    items.push({
      content: [
        {
          text: content,
          type: "output_text",
        },
      ],
      role: "assistant",
      status: "completed",
    } satisfies AgentInputItem)

    return items
  }, [])
}

export function mapAgentItemsToWidgetMessages(
  items: AgentInputItem[]
): WidgetMessage[] {
  return items.flatMap((item, index) => {
    if (!isMessageLikeItem(item)) {
      return []
    }

    if (item.role !== "assistant" && item.role !== "user") {
      return []
    }

    const content = extractMessageText(item.content)

    if (!content) {
      return []
    }

    return [
      {
        content,
        id:
          typeof item.id === "string" && item.id
            ? item.id
            : `message-${index + 1}`,
        role: item.role,
      },
    ]
  })
}
