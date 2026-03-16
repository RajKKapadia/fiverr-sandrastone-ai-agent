"use server"

import { refresh, revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  createKnowledgeItem,
  deleteKnowledgeItem,
} from "@/lib/knowledge/server"

export type CreateKnowledgeActionState = {
  topicName: string
  videoUrl: string
  error: string
}

function isValidHttpUrl(value: string) {
  try {
    const parsedUrl = new URL(value)

    return (
      parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
    )
  } catch {
    return false
  }
}

export async function createKnowledgeAction(
  _previousState: CreateKnowledgeActionState,
  formData: FormData
): Promise<CreateKnowledgeActionState> {
  const topicName = String(formData.get("topicName") ?? "").trim()
  const videoUrl = String(formData.get("videoUrl") ?? "").trim()

  if (!topicName || !videoUrl) {
    return {
      topicName,
      videoUrl,
      error: "Enter both the topic name and the video URL.",
    }
  }

  if (!isValidHttpUrl(videoUrl)) {
    return {
      topicName,
      videoUrl,
      error: "Enter a valid http or https video URL.",
    }
  }

  let createdKnowledgeItemId = ""

  try {
    const createdKnowledgeItem = await createKnowledgeItem({
      topicName,
      videoUrl,
    })

    createdKnowledgeItemId = createdKnowledgeItem.id
  } catch (error) {
    console.error("Failed to create knowledge item", error)

    return {
      topicName,
      videoUrl,
      error:
        error instanceof Error
          ? error.message
          : "Failed to process the video and upload the transcript.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/add")
  refresh()
  redirect(
    createdKnowledgeItemId
      ? `/dashboard?created=${encodeURIComponent(createdKnowledgeItemId)}`
      : "/dashboard"
  )
}

export async function deleteKnowledgeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim()

  if (!id) {
    return
  }

  await deleteKnowledgeItem(id)
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/add")
  revalidatePath(`/dashboard/transcripts/${id}`)
  refresh()
}
