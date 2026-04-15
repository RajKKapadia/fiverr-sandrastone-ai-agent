import type { AgentInputItem } from "@openai/agents"

import type { WidgetChatHistoryEntry } from "./types"

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
