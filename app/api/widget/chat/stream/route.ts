import { InputGuardrailTripwireTriggered, run } from "@openai/agents"
import { z } from "zod"

import { primaryAgent } from "@/lib/agent"
import { generateOutOfScopeResponse } from "@/lib/agent/out-of-scope"
import type { UserContext } from "@/lib/types"
import { getBearerToken, getWidgetUserId, verifyWidgetSessionToken } from "@/lib/widget/auth"
import { beginWidgetRequest, endWidgetRequest, getWidgetRequestBlockReason } from "@/lib/widget/rate-limit"
import { DatabaseSessionStore } from "@/lib/widget/session"
import type { WidgetChatStreamRequest, WidgetMessage } from "@/lib/widget/types"

export const runtime = "nodejs"

const AGENT_TIMEOUT_MS = 30_000
const MAX_QUERY_LENGTH = 2_000

const widgetChatStreamRequestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
})

function createSseChunk(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

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

async function getErrorMessage(error: unknown, input: {
  message: string
  userContext: UserContext
}) {
  if (error instanceof InputGuardrailTripwireTriggered) {
    return generateOutOfScopeResponse(input)
  }

  if (isTimeoutError(error)) {
    return "That request timed out. Please try again."
  }

  return "Something went wrong while processing that request."
}

function unauthorized(message: string) {
  return Response.json(
    {
      error: message,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 401,
    }
  )
}

export async function POST(request: Request) {
  const token = getBearerToken(request)

  if (!token) {
    return unauthorized("Missing widget authorization.")
  }

  let claims

  try {
    claims = verifyWidgetSessionToken(token)
  } catch (error) {
    return unauthorized(
      error instanceof Error ? error.message : "Invalid widget authorization."
    )
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = widgetChatStreamRequestSchema.safeParse(rawBody)

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid widget chat payload.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 400,
      }
    )
  }

  const body: WidgetChatStreamRequest = parsed.data
  const userId = getWidgetUserId(claims)
  const requestBlockReason = getWidgetRequestBlockReason(userId)

  if (requestBlockReason) {
    return Response.json(
      {
        error: requestBlockReason,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 429,
      }
    )
  }

  beginWidgetRequest(userId)

  const assistantMessageId = crypto.randomUUID()
  const encoder = new TextEncoder()
  const session = new DatabaseSessionStore(userId)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(createSseChunk(event, data)))
      }

      try {
        const result = await run(primaryAgent, body.message, {
          context: createWebsiteUserContext(userId),
          maxTurns: 8,
          session,
          signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
          stream: true,
        })

        send("message_start", {
          message: {
            content: "",
            id: assistantMessageId,
            role: "assistant",
          } satisfies WidgetMessage,
        })

        const textStream = result.toTextStream({
          compatibleWithNodeStreams: true,
        })
        let streamedText = ""

        for await (const value of textStream) {
          if (!value) {
            continue
          }

          const chunk = typeof value === "string" ? value : value.toString()

          streamedText += chunk
          send("text_delta", {
            delta: chunk,
          })
        }

        await result.completed

        const finalOutput =
          typeof result.finalOutput === "string" && result.finalOutput.trim()
            ? result.finalOutput.trim()
            : streamedText.trim()

        send("message_done", {
          message: {
            content:
              finalOutput || "I could not generate a response for that request.",
            id: assistantMessageId,
            role: "assistant",
          } satisfies WidgetMessage,
        })
      } catch (error) {
        console.error("[Widget] Stream request failed", {
          error: error instanceof Error ? error.message : String(error),
          siteKey: claims.siteKey,
          userId,
        })

        send("error", {
          message: await getErrorMessage(error, {
            message: body.message,
            userContext: createWebsiteUserContext(userId),
          }),
        })
      } finally {
        endWidgetRequest(userId)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}
