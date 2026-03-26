import { openai } from "@/lib/openai/client"
import type { UserContext } from "@/lib/types"

import { AGENT_MODEL } from "./config"
import {
  buildOutOfScopeResponsePrompt,
  getOutOfScopeFallbackResponse,
} from "./prompt"

export async function generateOutOfScopeResponse(input: {
  message: string
  userContext: UserContext
}) {
  try {
    const response = await openai.responses.create({
      input: buildOutOfScopeResponsePrompt({
        channelType: input.userContext.channelType,
        username: input.userContext.username,
        userMessage: input.message,
      }),
      model: AGENT_MODEL,
    })

    const output = response.output_text.trim()

    return output || getOutOfScopeFallbackResponse(input.userContext.channelType)
  } catch (error) {
    console.error("[Agent] Out-of-scope response generation failed", {
      channelType: input.userContext.channelType,
      error: error instanceof Error ? error.message : String(error),
      userId: input.userContext.userId,
    })

    return getOutOfScopeFallbackResponse(input.userContext.channelType)
  }
}
