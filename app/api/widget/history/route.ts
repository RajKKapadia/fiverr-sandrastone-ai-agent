import { getBearerToken, getWidgetUserId, verifyWidgetSessionToken } from "@/lib/widget/auth"
import { mapAgentItemsToWidgetMessages } from "@/lib/widget/messages"
import { DatabaseSessionStore } from "@/lib/widget/session"
import type { WidgetHistoryResponse } from "@/lib/widget/types"

export const runtime = "nodejs"

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

export async function GET(request: Request) {
  const token = getBearerToken(request)

  if (!token) {
    return unauthorized("Missing widget authorization.")
  }

  try {
    const claims = verifyWidgetSessionToken(token)
    const session = new DatabaseSessionStore(getWidgetUserId(claims))
    const messages: WidgetHistoryResponse["messages"] = mapAgentItemsToWidgetMessages(
      await session.getItems()
    )

    return Response.json(
      {
        messages,
      } satisfies WidgetHistoryResponse,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    return unauthorized(
      error instanceof Error ? error.message : "Invalid widget authorization."
    )
  }
}
