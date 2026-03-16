import "server-only"

import { createReadStream } from "node:fs"

import { openai } from "@/lib/openai/client"

type TranscriptSegment = {
  start: number
  text: string
}

function formatTimestamp(totalSeconds: number) {
  const roundedSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(roundedSeconds / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const seconds = roundedSeconds % 60

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => value.toString().padStart(2, "0"))
      .join(":")
  }

  return [minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":")
}

function formatSegmentTranscript(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => {
      const text = segment.text.trim()

      if (!text) {
        return null
      }

      return `[start time: ${formatTimestamp(segment.start)}] ${text}`
    })
    .filter((segment): segment is string => Boolean(segment))
    .join("\n")
}

export async function transcribeAudioFile(audioPath: string) {
  const transcription = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  })

  const segments = Array.isArray(transcription.segments)
    ? transcription.segments
        .map((segment) => ({
          start: segment.start,
          text: segment.text,
        }))
        .filter((segment) => segment.text.trim().length > 0)
    : []

  const formattedTranscript =
    segments.length > 0
      ? formatSegmentTranscript(segments)
      : transcription.text.trim()

  if (!formattedTranscript) {
    throw new Error("The transcription response did not include transcript text.")
  }

  return {
    formattedTranscript,
    plainText: transcription.text.trim(),
    segments,
  }
}
