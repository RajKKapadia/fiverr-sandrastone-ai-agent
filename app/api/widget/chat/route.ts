import { type AgentInputItem, InputGuardrailTripwireTriggered, run } from "@openai/agents"
import { z } from "zod"

import { primaryAgent } from "@/lib/agent"
import { generateOutOfScopeResponse } from "@/lib/agent/out-of-scope"
import type { UserContext } from "@/lib/types"
import { isKnownWidgetOrigin } from "@/lib/widget/config"
import { mapWidgetMessagesToAgentItems } from "@/lib/widget/messages"
import {
  beginWidgetRequest,
  endWidgetRequest,
  getWidgetRequestBlockReason,
} from "@/lib/widget/rate-limit"
import {
  buildCorsHeaders,
  getOrigin,
  getWidgetRequestUserId,
  normalizeHistory,
} from "@/lib/widget/request"
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

function createAgentInput(body: WidgetChatRequest): AgentInputItem[] {
  return [
    ...mapWidgetMessagesToAgentItems(body.history),
    {
      content: body.message,
      role: "user",
    } satisfies AgentInputItem,
  ]
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

function jsonResponseWithCors(
  body: Record<string, unknown>,
  origin: string,
  status = 200
) {
  return Response.json(body, {
    headers: buildCorsHeaders(origin),
    status,
  })
}

function jsonError(message: string, status: number, origin?: string) {
  return Response.json(
    {
      error: message,
    },
    {
      headers: origin
        ? buildCorsHeaders(origin)
        : {
            "Cache-Control": "no-store",
          },
      status,
    }
  )
}

export async function OPTIONS(request: Request) {
  const origin = getOrigin(request)

  if (!origin || !isKnownWidgetOrigin(origin)) {
    return new Response(null, {
      status: 403,
    })
  }

  return new Response(null, {
    headers: buildCorsHeaders(origin),
    status: 204,
  })
}

export async function POST(request: Request) {
  const origin = getOrigin(request)

  if (!origin) {
    return jsonError("Missing request origin.", 400)
  }

  if (!isKnownWidgetOrigin(origin)) {
    return jsonError("This website is not allowed to use the widget chat API.", 403)
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = widgetChatRequestSchema.safeParse(rawBody)

  if (!parsed.success) {
    return jsonError("Invalid widget chat payload.", 400, origin)
  }

  const body: WidgetChatRequest = {
    ...parsed.data,
    history: normalizeHistory(parsed.data),
  }
  const userId = getWidgetRequestUserId(request, origin)
  const requestBlockReason = getWidgetRequestBlockReason(userId)

  if (requestBlockReason) {
    return jsonError(requestBlockReason, 429, origin)
  }

  beginWidgetRequest(userId)

  const userContext = createWebsiteUserContext(userId)

  try {
    const result = await run(primaryAgent, createAgentInput(body), {
      context: userContext,
      maxTurns: 8,
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    })

    const finalOutput =
      typeof result.finalOutput === "string" && result.finalOutput.trim()
        ? result.finalOutput.trim()
        : "I could not generate a response for that request."

    return jsonResponseWithCors(
      {
        message: {
          content: finalOutput,
          id: crypto.randomUUID(),
          role: "assistant",
        } satisfies WidgetMessage,
      } satisfies WidgetChatResponse,
      origin
    )
  } catch (error) {
    console.error("[Widget] Chat request failed", {
      error: error instanceof Error ? error.message : String(error),
      origin,
      userId,
    })

    if (error instanceof InputGuardrailTripwireTriggered) {
      return jsonResponseWithCors(
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
        origin
      )
    }

    return jsonError(
      await getErrorMessage(error, {
        message: body.message,
        userContext,
      }),
      500,
      origin
    )
  } finally {
    endWidgetRequest(userId)
  }
}
