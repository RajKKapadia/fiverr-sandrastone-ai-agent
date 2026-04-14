import { InputGuardrailTripwireTriggered, run } from "@openai/agents"
import { z } from "zod"

import { primaryAgent } from "@/lib/agent"
import { generateOutOfScopeResponse } from "@/lib/agent/out-of-scope"
import type { UserContext } from "@/lib/types"
import {
  getBearerToken,
  getWidgetUserId,
  verifyWidgetSessionToken,
} from "@/lib/widget/auth"
import { mapWidgetMessagesToAgentItems } from "@/lib/widget/messages"
import {
  beginWidgetRequest,
  endWidgetRequest,
  getWidgetRequestBlockReason,
} from "@/lib/widget/rate-limit"
import { DatabaseSessionStore } from "@/lib/widget/session"
import type {
  WidgetChatRequest,
  WidgetChatResponse,
  WidgetMessage,
} from "@/lib/widget/types"

export const runtime = "nodejs"

const AGENT_TIMEOUT_MS = 30_000
const MAX_QUERY_LENGTH = 2_000

const widgetChatRequestSchema = z.object({
  history: z
    .array(
      z.object({
        content: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
        role: z.enum(["assistant", "user"]),
      })
    )
    .default([]),
  message: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
})

function createWebsiteUserContext(userId: string): UserContext {
  return {
    channelType: "website",
    userId,
    username: "Website visitor",
  }
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("timed out"))
  )
}

async function getErrorMessage(
  error: unknown,
  input: {
    message: string
    userContext: UserContext
  }
) {
  if (error instanceof InputGuardrailTripwireTriggered) {
    return generateOutOfScopeResponse(input)
  }

  if (isTimeoutError(error)) {
    return "That request timed out. Please try again."
  }

  return "Something went wrong while processing that request."
}

function jsonError(message: string, status: number) {
  return Response.json(
    {
      error: message,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    }
  )
}

function normalizeHistory(body: WidgetChatRequest) {
  const lastHistoryEntry = body.history.at(-1)

  if (
    lastHistoryEntry?.role === "user" &&
    lastHistoryEntry.content.trim() === body.message
  ) {
    return body.history.slice(0, -1)
  }

  return body.history
}

async function synchronizeSessionWithHistory(
  session: DatabaseSessionStore,
  history: WidgetChatRequest["history"]
) {
  await session.clearSession()

  const items = mapWidgetMessagesToAgentItems(history)

  if (items.length > 0) {
    await session.addItems(items)
  }
}

export async function POST(request: Request) {
  const token = getBearerToken(request)

  if (!token) {
    return jsonError("Missing widget authorization.", 401)
  }

  let claims

  try {
    claims = verifyWidgetSessionToken(token)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid widget authorization.",
      401
    )
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = widgetChatRequestSchema.safeParse(rawBody)

  if (!parsed.success) {
    return jsonError("Invalid widget chat payload.", 400)
  }

  const body: WidgetChatRequest = {
    ...parsed.data,
    history: normalizeHistory(parsed.data),
  }
  const userId = getWidgetUserId(claims)
  const requestBlockReason = getWidgetRequestBlockReason(userId)

  if (requestBlockReason) {
    return jsonError(requestBlockReason, 429)
  }

  beginWidgetRequest(userId)

  const session = new DatabaseSessionStore(userId)
  const userContext = createWebsiteUserContext(userId)

  try {
    await synchronizeSessionWithHistory(session, body.history)

    const result = await run(primaryAgent, body.message, {
      context: userContext,
      maxTurns: 8,
      session,
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    })

    const finalOutput =
      typeof result.finalOutput === "string" && result.finalOutput.trim()
        ? result.finalOutput.trim()
        : "I could not generate a response for that request."

    return Response.json(
      {
        message: {
          content: finalOutput,
          id: crypto.randomUUID(),
          role: "assistant",
        } satisfies WidgetMessage,
      } satisfies WidgetChatResponse,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    console.error("[Widget] Chat request failed", {
      error: error instanceof Error ? error.message : String(error),
      siteKey: claims.siteKey,
      userId,
    })

    if (error instanceof InputGuardrailTripwireTriggered) {
      return Response.json(
        {
          message: {
            content: await getErrorMessage(error, {
              message: body.message,
              userContext,
            }),
            id: crypto.randomUUID(),
            role: "assistant",
          } satisfies WidgetMessage,
        } satisfies WidgetChatResponse,
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      )
    }

    return jsonError(
      await getErrorMessage(error, {
        message: body.message,
        userContext,
      }),
      500
    )
  } finally {
    endWidgetRequest(userId)
  }
}
