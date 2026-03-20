import { z } from "zod"

import { createWidgetSessionToken } from "@/lib/widget/auth"
import { findWidgetSiteByKey, isKnownWidgetOrigin } from "@/lib/widget/config"
import type {
  WidgetBootstrapRequest,
  WidgetBootstrapResponse,
} from "@/lib/widget/types"

export const runtime = "nodejs"

const widgetBootstrapRequestSchema = z.object({
  browserSessionId: z.string().trim().min(12).max(200),
  siteKey: z.string().trim().min(1),
})

function getOrigin(request: Request) {
  return request.headers.get("origin")?.trim() ?? null
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

function createFrameUrl(request: Request, siteKey: string) {
  const url = new URL("/widget/frame", request.url)
  url.searchParams.set("siteKey", siteKey)
  return `${url.pathname}${url.search}`
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
    return Response.json(
      {
        error: "Missing request origin.",
      },
      { status: 400 }
    )
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = widgetBootstrapRequestSchema.safeParse(rawBody)

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid widget bootstrap payload.",
      },
      {
        headers: buildCorsHeaders(origin),
        status: 400,
      }
    )
  }

  const body: WidgetBootstrapRequest = parsed.data
  const site = findWidgetSiteByKey(body.siteKey)

  if (!site || !site.origins.includes(origin)) {
    return Response.json(
      {
        error: "This website is not allowed to load the widget.",
      },
      {
        headers: buildCorsHeaders(origin),
        status: 403,
      }
    )
  }

  const responseBody: WidgetBootstrapResponse = {
    frameUrl: createFrameUrl(request, site.siteKey),
    site: {
      placeholder: site.placeholder,
      siteKey: site.siteKey,
      title: site.title,
    },
    token: createWidgetSessionToken({
      browserSessionId: body.browserSessionId,
      parentOrigin: origin,
      siteKey: site.siteKey,
    }),
  }

  return Response.json(responseBody, {
    headers: buildCorsHeaders(origin),
  })
}
