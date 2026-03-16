export type KnowledgeStatus =
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed"

export type KnowledgeItem = {
  id: string
  lastError: string | null
  openaiFileId: string | null
  sourceTitle: string | null
  topicName: string
  videoUrl: string
  status: KnowledgeStatus
  createdAt: string
}

export type CreateKnowledgeInput = {
  topicName: string
  videoUrl: string
}

export type KnowledgeTranscript = {
  id: string
  topicName: string
  content: string
}
