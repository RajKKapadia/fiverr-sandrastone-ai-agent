import "server-only"

import { toFile } from "openai/uploads"

import { serverEnv } from "@/data/env/server"
import { openai } from "@/lib/openai/client"
import type { CreateKnowledgeInput, KnowledgeStatus } from "@/lib/knowledge/types"
import type { YoutubeVideoMetadata } from "@/lib/knowledge/pipeline/youtube"

export type UploadedTranscriptFile = {
  createdAt: string
  openaiFileId: string
  status: KnowledgeStatus
  vectorStoreFileId: string
}

function sanitizeFileNamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function buildTranscriptFilename(
  metadata: YoutubeVideoMetadata,
  input: CreateKnowledgeInput
) {
  const baseName =
    sanitizeFileNamePart(input.topicName) ||
    sanitizeFileNamePart(metadata.title) ||
    metadata.videoId

  return `${baseName || "knowledge-transcript"}-${metadata.videoId}.txt`
}

export function buildVectorStoreAttributes(
  input: CreateKnowledgeInput,
  metadata: YoutubeVideoMetadata,
  openaiFileId: string
) {
  return {
    duration_seconds: metadata.durationSeconds ?? 0,
    openai_file_id: openaiFileId,
    source: "youtube",
    title: metadata.title,
    topic_name: input.topicName,
    transcript_format: "timestamped_segments_v1",
    video_id: metadata.videoId,
    video_url: metadata.videoUrl,
  } satisfies Record<string, string | number | boolean>
}

export async function uploadTranscriptToVectorStore(input: {
  metadata: YoutubeVideoMetadata
  transcriptText: string
  values: CreateKnowledgeInput
}) {
  const transcriptFile = await toFile(
    Buffer.from(input.transcriptText, "utf8"),
    buildTranscriptFilename(input.metadata, input.values),
    { type: "text/plain" }
  )

  const uploadedFile = await openai.files.create({
    file: transcriptFile,
    purpose: "user_data",
  })

  try {
    const vectorStoreFile = await openai.vectorStores.files.create(
      serverEnv.OPENAI_VECTOR_STORE_ID,
      {
        attributes: buildVectorStoreAttributes(
          input.values,
          input.metadata,
          uploadedFile.id
        ),
        file_id: uploadedFile.id,
      }
    )

    return {
      createdAt: new Date(vectorStoreFile.created_at * 1000).toISOString(),
      openaiFileId: uploadedFile.id,
      status: vectorStoreFile.status,
      vectorStoreFileId: vectorStoreFile.id,
    } satisfies UploadedTranscriptFile
  } catch (error) {
    await openai.files.delete(uploadedFile.id).catch(() => undefined)
    throw error
  }
}
