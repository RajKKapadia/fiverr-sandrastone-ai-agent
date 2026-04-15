import { createHash } from "node:crypto"

import { InputGuardrailTripwireTriggered, run } from "@openai/agents"
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

function normalizeOrigin(origin: string) {
  return new URL(origin).origin
}

function getOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim()

  if (!origin) {
    return null
  }

  try {
    return normalizeOrigin(origin)
  } catch {
    return null
  }
}

function buildCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    Vary: "Origin",
  }
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

function getClientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim()

  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim()

    if (firstAddress) {
      return firstAddress
    }
  }

  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null
  )
}

function getWidgetRequestUserId(request: Request, origin: string) {
  const clientAddress = getClientAddress(request) ?? "unknown-address"
  const userAgent = request.headers.get("user-agent")?.trim() ?? "unknown-agent"
  const requestKey = createHash("sha256")
    .update(`${origin}\n${clientAddress}\n${userAgent}`)
    .digest("hex")

  return `website:${requestKey}`
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
