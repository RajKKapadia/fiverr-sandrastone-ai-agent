import { tool } from "@openai/agents"
import { z } from "zod"

import { serverEnv } from "@/data/env/server"
import { openai } from "@/lib/openai/client"

const DEFAULT_MAX_RESULTS = 3
const MAX_MAX_RESULTS = 5
const MAX_EXCERPT_LENGTH = 900
const MIN_VECTOR_SEARCH_SCORE = 0.50
const TIMESTAMP_PATTERN = /\[start time:\s*([0-9]{2}(?::[0-9]{2}){1,2})\]/i

type VectorStoreSearchPage = Awaited<
  ReturnType<typeof openai.vectorStores.search>
>

type VectorStoreSearchResult = VectorStoreSearchPage["data"][number]

type SearchResultAttributes = Record<string, string | number | boolean> | null

type FormattedKnowledgeResult = {
  excerpt: string
  referenceTime: string | null
  referenceUrl: string | null
  score: number
  sourceTitle: string
  topicName: string
  videoUrl: string | null
}

type GroupedKnowledgeResult = {
  bestScore: number
  excerpts: string[]
  referenceTimes: string[]
  referenceUrl: string | null
  sourceTitle: string
  topicName: string
  videoUrl: string | null
}

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

function buildReferenceUrl(
  videoUrl: string | null,
  timestampSeconds: number | null
) {
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

function formatReferenceTimes(referenceTimes: string[]) {
  if (referenceTimes.length === 0) {
    return "Not found in matched excerpt"
  }

  if (referenceTimes.length === 1) {
    return referenceTimes[0]
  }

  if (referenceTimes.length === 2) {
    return `${referenceTimes[0]} and ${referenceTimes[1]}`
  }

  return `${referenceTimes.slice(0, -1).join(", ")}, and ${referenceTimes.at(-1)}`
}

function getResultExcerpt(result: VectorStoreSearchResult) {
  const excerpt = result.content
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()

  return excerpt || "No excerpt available from the matched vector store chunk."
}

function createFormattedKnowledgeResult(
  result: VectorStoreSearchResult
): FormattedKnowledgeResult {
  const attributes = result.attributes
  const topicName =
    getAttributeString(attributes, "topic_name") ||
    getAttributeString(attributes, "title") ||
    result.filename
  const sourceTitle = getAttributeString(attributes, "title") || result.filename
  const videoUrl = getAttributeString(attributes, "video_url")
  const excerpt = normalizeExcerpt(getResultExcerpt(result))
  const { timestampLabel, timestampSeconds } = extractTimestamp(excerpt)

  return {
    excerpt,
    referenceTime: timestampLabel,
    referenceUrl: buildReferenceUrl(videoUrl, timestampSeconds),
    score: result.score,
    sourceTitle,
    topicName,
    videoUrl,
  }
}

function groupKnowledgeSearchResults(results: VectorStoreSearchResult[]) {
  const groups = new Map<string, GroupedKnowledgeResult>()

  for (const result of results) {
    const formatted = createFormattedKnowledgeResult(result)
    const key =
      formatted.videoUrl ?? `${formatted.sourceTitle}:${formatted.topicName}`
    const excerptLabel = formatted.referenceTime
      ? `[${formatted.referenceTime}] ${formatted.excerpt}`
      : formatted.excerpt
    const existingGroup = groups.get(key)

    if (!existingGroup) {
      groups.set(key, {
        bestScore: formatted.score,
        excerpts: [excerptLabel],
        referenceTimes: formatted.referenceTime
          ? [formatted.referenceTime]
          : [],
        referenceUrl: formatted.referenceTime ? formatted.referenceUrl : null,
        sourceTitle: formatted.sourceTitle,
        topicName: formatted.topicName,
        videoUrl: formatted.videoUrl,
      })
      continue
    }

    if (!existingGroup.excerpts.includes(excerptLabel)) {
      existingGroup.excerpts.push(excerptLabel)
    }

    if (
      formatted.referenceTime &&
      !existingGroup.referenceTimes.includes(formatted.referenceTime)
    ) {
      existingGroup.referenceTimes.push(formatted.referenceTime)
    }

    if (
      !existingGroup.referenceUrl &&
      formatted.referenceTime &&
      formatted.referenceUrl
    ) {
      existingGroup.referenceUrl = formatted.referenceUrl
    }

    existingGroup.bestScore = Math.max(existingGroup.bestScore, formatted.score)
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    referenceUrl: group.referenceUrl ?? group.videoUrl,
  }))
}

function formatKnowledgeSearchResult(
  result: GroupedKnowledgeResult,
  index: number
) {
  const excerpts = result.excerpts.map((excerpt) => `- ${excerpt}`).join("\n")

  return [
    `${index + 1}. Topic: ${result.topicName}`,
    `Source: ${result.sourceTitle}`,
    `Supporting excerpts:\n${excerpts}`,
    `Reference URL: ${result.referenceUrl ?? "Unavailable"}`,
    `Reference times: ${formatReferenceTimes(result.referenceTimes)}`,
    `Similarity score: ${result.bestScore.toFixed(3)}`,
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

  return response.data.filter(
    (result) => result.score >= MIN_VECTOR_SEARCH_SCORE
  )
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
    "Search the uploaded vector database for trading related information.",
  parameters: z.object({
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(MAX_MAX_RESULTS)
      .default(DEFAULT_MAX_RESULTS),
    query: z.string().trim().min(1),
  }),
  async execute(input): Promise<string> {
    const results = await searchKnowledgeBase(input)
    const groupedResults = groupKnowledgeSearchResults(results)

    if (results.length === 0) {
      return [
        `Knowledge base search for: "${input.query}"`,
        "",
        "No trading related information was found in the vector database.",
      ].join("\n")
    }

    return [
      `Knowledge base search for: "${input.query}"`,
      `Returned ${groupedResults.length} relevant result${groupedResults.length === 1 ? "" : "s"}.`,
      "",
      ...groupedResults.map((result, index) =>
        formatKnowledgeSearchResult(result, index)
      ),
    ].join("\n\n")
  },
  async errorFunction(): Promise<string> {
    return "An error occurred while searching the knowledge base."
  },
})

export const agentTools = [
  currentDateTimeTool,
  searchKnowledgeBaseTool,
] as const
