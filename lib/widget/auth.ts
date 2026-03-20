import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import { serverEnv } from "@/data/env/server"

import type { WidgetSessionClaims } from "./types"

const TOKEN_VERSION = 1
const WIDGET_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7

const widgetSessionClaimsSchema = z.object({
  browserSessionId: z.string().trim().min(12).max(200),
  expiresAt: z.number().int().positive(),
  issuedAt: z.number().int().positive(),
  parentOrigin: z.string().url(),
  siteKey: z.string().trim().min(1),
  version: z.literal(TOKEN_VERSION),
})

function getWidgetSigningSecret() {
  const secret = serverEnv.WIDGET_SIGNING_SECRET.trim()

  if (!secret) {
    throw new Error("WIDGET_SIGNING_SECRET is not configured.")
  }

  return secret
}

function signPayload(payload: string) {
  return createHmac("sha256", getWidgetSigningSecret())
    .update(payload)
    .digest("base64url")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function createWidgetSessionToken(input: {
  browserSessionId: string
  parentOrigin: string
  siteKey: string
}) {
  const issuedAt = Date.now()
  const claims: WidgetSessionClaims = {
    browserSessionId: input.browserSessionId,
    expiresAt: issuedAt + WIDGET_TOKEN_TTL_MS,
    issuedAt,
    parentOrigin: input.parentOrigin,
    siteKey: input.siteKey,
    version: TOKEN_VERSION,
  }
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url"
  )
  const signature = signPayload(payload)

  return `${payload}.${signature}`
}

export function verifyWidgetSessionToken(token: string) {
  const [payload, signature] = token.split(".")

  if (!payload || !signature) {
    throw new Error("Invalid widget token.")
  }

  const expectedSignature = signPayload(payload)

  if (!safeEqual(signature, expectedSignature)) {
    throw new Error("Invalid widget token signature.")
  }

  const rawClaims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  const claims = widgetSessionClaimsSchema.parse(rawClaims)

  if (claims.expiresAt < Date.now()) {
    throw new Error("Widget token has expired.")
  }

  return claims
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? ""

  if (!authorization.startsWith("Bearer ")) {
    return null
  }

  const token = authorization.slice("Bearer ".length).trim()
  return token || null
}

export function getWidgetUserId(claims: WidgetSessionClaims) {
  return `website:${claims.siteKey}:${claims.browserSessionId}`
}
