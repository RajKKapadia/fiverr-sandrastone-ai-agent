import "server-only"

import { z } from "zod"

import { serverEnv } from "@/data/env/server"

import type { WidgetSiteConfig } from "./types"

const DEFAULT_WIDGET_PLACEHOLDER = "Ask about the videos..."
const DEFAULT_WIDGET_TITLE = "SandraStone Assistant"

const widgetSiteConfigSchema = z.object({
  origins: z.array(z.string().url()).min(1),
  placeholder: z.string().trim().min(1).optional(),
  siteKey: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
})

const widgetSiteConfigListSchema = z.array(widgetSiteConfigSchema)

let cachedSiteConfigs: WidgetSiteConfig[] | null = null

function normalizeOrigin(origin: string) {
  return new URL(origin).origin
}

function parseSiteConfigs(): WidgetSiteConfig[] {
  if (!serverEnv.WIDGET_SITE_CONFIGS.trim()) {
    return []
  }

  const parsed = JSON.parse(serverEnv.WIDGET_SITE_CONFIGS)
  const result = widgetSiteConfigListSchema.parse(parsed)

  return result.map((site) => ({
    origins: Array.from(new Set(site.origins.map(normalizeOrigin))),
    placeholder: site.placeholder ?? DEFAULT_WIDGET_PLACEHOLDER,
    siteKey: site.siteKey,
    title: site.title ?? DEFAULT_WIDGET_TITLE,
  }))
}

export function getWidgetSiteConfigs(): WidgetSiteConfig[] {
  if (!cachedSiteConfigs) {
    cachedSiteConfigs = parseSiteConfigs()
  }

  return cachedSiteConfigs
}

export function findWidgetSiteByKey(siteKey: string) {
  return getWidgetSiteConfigs().find((site) => site.siteKey === siteKey) ?? null
}

export function isKnownWidgetOrigin(origin: string) {
  return getWidgetSiteConfigs().some((site) => site.origins.includes(origin))
}
