import { createHash } from "node:crypto"

import type { WidgetChatRequest } from "./types"

function normalizeOrigin(origin: string) {
  return new URL(origin).origin
}

export function getOrigin(request: Request) {
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

export function buildCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    Vary: "Origin",
  }
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

export function getWidgetRequestUserId(request: Request, origin: string) {
  const clientAddress = getClientAddress(request) ?? "unknown-address"
  const userAgent = request.headers.get("user-agent")?.trim() ?? "unknown-agent"
  const requestKey = createHash("sha256")
    .update(`${origin}\n${clientAddress}\n${userAgent}`)
    .digest("hex")

  return `website:${requestKey}`
}

export function normalizeHistory(body: WidgetChatRequest) {
  const lastHistoryEntry = body.history.at(-1)

  if (
    lastHistoryEntry?.role === "user" &&
    lastHistoryEntry.content.trim() === body.message
  ) {
    return body.history.slice(0, -1)
  }

  return body.history
}
