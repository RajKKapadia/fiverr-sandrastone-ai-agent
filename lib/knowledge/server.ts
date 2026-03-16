import "server-only"

import { serverEnv } from "@/data/env/server"
import { downloadYoutubeAudio } from "@/lib/knowledge/pipeline/youtube"
import { transcribeAudioFile } from "@/lib/knowledge/pipeline/transcript"
import { uploadTranscriptToVectorStore } from "@/lib/knowledge/pipeline/vector-store"
import type {
  CreateKnowledgeInput,
  KnowledgeItem,
  KnowledgeTranscript,
} from "@/lib/knowledge/types"
import { openai } from "@/lib/openai/client"

type VectorStoreFileRecord = Awaited<
  ReturnType<typeof openai.vectorStores.files.retrieve>
>

function getAttributeString(
  attributes: VectorStoreFileRecord["attributes"],
  key: string
) {
  const value = attributes?.[key]

  return typeof value === "string" ? value : null
}

function mapVectorStoreFileToKnowledgeItem(
  file: VectorStoreFileRecord
): KnowledgeItem {
  const topicName =
    getAttributeString(file.attributes, "topic_name") ||
    getAttributeString(file.attributes, "title") ||
    "Untitled knowledge item"

  return {
    createdAt: new Date(file.created_at * 1000).toISOString(),
    id: file.id,
    lastError: file.last_error?.message ?? null,
    openaiFileId: getAttributeString(file.attributes, "openai_file_id"),
    sourceTitle: getAttributeString(file.attributes, "title"),
    status: file.status,
    topicName,
    videoUrl: getAttributeString(file.attributes, "video_url") || "",
  }
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404
  )
}

async function retrieveVectorStoreFile(id: string) {
  try {
    return await openai.vectorStores.files.retrieve(id, {
      vector_store_id: serverEnv.OPENAI_VECTOR_STORE_ID,
    })
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }

    throw error
  }
}

export async function listKnowledgeItems(): Promise<KnowledgeItem[]> {
  const items: KnowledgeItem[] = []

  for await (const file of openai.vectorStores.files.list(
    serverEnv.OPENAI_VECTOR_STORE_ID,
    {
      order: "desc",
    }
  )) {
    items.push(mapVectorStoreFileToKnowledgeItem(file))
  }

  return items
}

export async function getKnowledgeItem(id: string): Promise<KnowledgeItem | null> {
  const file = await retrieveVectorStoreFile(id)

  return file ? mapVectorStoreFileToKnowledgeItem(file) : null
}

export async function getKnowledgeTranscript(
  id: string
): Promise<KnowledgeTranscript | null> {
  const file = await retrieveVectorStoreFile(id)

  if (!file || file.status !== "completed") {
    return null
  }

  const knowledgeItem = mapVectorStoreFileToKnowledgeItem(file)
  const transcriptChunks: string[] = []

  for await (const entry of openai.vectorStores.files.content(id, {
    vector_store_id: serverEnv.OPENAI_VECTOR_STORE_ID,
  })) {
    const text = entry.text?.trim()

    if (text) {
      transcriptChunks.push(text)
    }
  }

  const content = transcriptChunks.join("\n\n").trim()

  if (!content) {
    return null
  }

  return {
    content,
    id: file.id,
    topicName: knowledgeItem.topicName,
  }
}

export async function createKnowledgeItem(
  input: CreateKnowledgeInput
): Promise<KnowledgeItem> {
  const downloadedAudio = await downloadYoutubeAudio(input.videoUrl)

  try {
    const transcription = await transcribeAudioFile(downloadedAudio.audioPath)
    const uploadResult = await uploadTranscriptToVectorStore({
      metadata: downloadedAudio.metadata,
      transcriptText: transcription.formattedTranscript,
      values: input,
    })

    return {
      createdAt: uploadResult.createdAt,
      id: uploadResult.vectorStoreFileId,
      lastError: null,
      openaiFileId: uploadResult.openaiFileId,
      sourceTitle: downloadedAudio.metadata.title,
      status: uploadResult.status,
      topicName: input.topicName,
      videoUrl: downloadedAudio.metadata.videoUrl,
    }
  } finally {
    await downloadedAudio.cleanup()
  }
}

export async function deleteKnowledgeItem(id: string): Promise<void> {
  const file = await retrieveVectorStoreFile(id)

  if (!file) {
    return
  }

  const openaiFileId = getAttributeString(file.attributes, "openai_file_id")

  await openai.vectorStores.files.delete(id, {
    vector_store_id: serverEnv.OPENAI_VECTOR_STORE_ID,
  })

  if (openaiFileId) {
    await openai.files.delete(openaiFileId)
  }
}
