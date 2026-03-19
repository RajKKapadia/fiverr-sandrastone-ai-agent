import "server-only"

import { tool } from "@openai/agents"
import { z } from "zod"

import { serverEnv } from "@/data/env/server"
import { openai } from "@/lib/openai/client"

const DEFAULT_MAX_RESULTS = 3
const MAX_MAX_RESULTS = 5
const MAX_EXCERPT_LENGTH = 900
const TIMESTAMP_PATTERN = /\[start time:\s*([0-9]{2}(?::[0-9]{2}){1,2})\]/i

type VectorStoreSearchPage = Awaited<
  ReturnType<typeof openai.vectorStores.search>
>

type VectorStoreSearchResult = VectorStoreSearchPage["data"][number]

type SearchResultAttributes = Record<string, string | number | boolean> | null

function getAttributeString(attributes: SearchResultAttributes, key: string) {
  const value = attributes?.[key]

  return typeof value === "string" ? value : null
}

function parseTimestampToSeconds(timestamp: string) {
  const parts = timestamp.split(":").map((part) => Number.parseInt(part, 10))

  if (parts.some((part) => Number.isNaN(part))) {
    return null
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  if (parts.length === 3) {
    return parts[0] * 60 * 60 + parts[1] * 60 + parts[2]
  }

  return null
}

function extractTimestamp(text: string) {
  const matchedTimestamp = text.match(TIMESTAMP_PATTERN)?.[1] ?? null

  if (!matchedTimestamp) {
    return {
      timestampLabel: null,
      timestampSeconds: null,
    }
  }

  return {
    timestampLabel: matchedTimestamp,
    timestampSeconds: parseTimestampToSeconds(matchedTimestamp),
  }
}

function normalizeExcerpt(text: string) {
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim()

  if (normalized.length <= MAX_EXCERPT_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, MAX_EXCERPT_LENGTH).trimEnd()}...`
}

function buildReferenceUrl(videoUrl: string | null, timestampSeconds: number | null) {
  if (!videoUrl) {
    return null
  }

  if (timestampSeconds === null) {
    return videoUrl
  }

  try {
    const url = new URL(videoUrl)
    url.searchParams.set("t", `${timestampSeconds}s`)
    return url.toString()
  } catch {
    return videoUrl
  }
}

function getResultExcerpt(result: VectorStoreSearchResult) {
  const excerpt = result.content
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()

  return excerpt || "No excerpt available from the matched vector store chunk."
}

function formatKnowledgeSearchResult(
  result: VectorStoreSearchResult,
  index: number
) {
  const attributes = result.attributes
  const topicName =
    getAttributeString(attributes, "topic_name") ||
    getAttributeString(attributes, "title") ||
    result.filename
  const sourceTitle = getAttributeString(attributes, "title") || result.filename
  const videoUrl = getAttributeString(attributes, "video_url")
  const excerpt = normalizeExcerpt(getResultExcerpt(result))
  const { timestampLabel, timestampSeconds } = extractTimestamp(excerpt)
  const referenceUrl = buildReferenceUrl(videoUrl, timestampSeconds)

  return [
    `${index + 1}. Topic: ${topicName}`,
    `Source: ${sourceTitle}`,
    `Excerpt:\n${excerpt}`,
    `Reference URL: ${referenceUrl ?? "Unavailable"}`,
    `Reference time: ${timestampLabel ?? "Not found in matched excerpt"}`,
    `Similarity score: ${result.score.toFixed(3)}`,
  ].join("\n")
}

async function searchKnowledgeBase(input: {
  maxResults: number
  query: string
}) {
  const response = await openai.vectorStores.search(
    serverEnv.OPENAI_VECTOR_STORE_ID,
    {
      max_num_results: input.maxResults,
      query: input.query,
      rewrite_query: true,
    }
  )

  return response.data
}

export const currentDateTimeTool = tool({
  name: "current_date_time",
  description: "Get the current date and time in UTC.",
  parameters: z.object({}),
  async execute(): Promise<string> {
    const formatted = new Date().toLocaleString("en-US", {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    return `The current date and time is ${formatted} (UTC).`
  },
  async errorFunction(): Promise<string> {
    return "An error occurred while getting the current date and time."
  },
})

export const searchKnowledgeBaseTool = tool({
  name: "search_knowledge_base",
  description:
    "Search the uploaded vector database for relevant knowledge and return excerpts with source references.",
  parameters: z.object({
    maxResults: z.number().int().min(1).max(MAX_MAX_RESULTS).default(DEFAULT_MAX_RESULTS),
    query: z.string().trim().min(1),
  }),
  async execute(input): Promise<string> {
    const results = await searchKnowledgeBase(input)

    if (results.length === 0) {
      return [
        `Knowledge base search for: "${input.query}"`,
        "",
        "No relevant content was found in the vector database.",
      ].join("\n")
    }

    return [
      `Knowledge base search for: "${input.query}"`,
      `Returned ${results.length} relevant result${results.length === 1 ? "" : "s"}.`,
      "",
      ...results.map((result, index) => formatKnowledgeSearchResult(result, index)),
    ].join("\n\n")
  },
  async errorFunction(): Promise<string> {
    return "An error occurred while searching the knowledge base."
  },
})

export const agentTools = [currentDateTimeTool, searchKnowledgeBaseTool] as const
