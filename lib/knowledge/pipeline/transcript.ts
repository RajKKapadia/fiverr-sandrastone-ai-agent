import "server-only"

import { execFile } from "node:child_process"
import { createReadStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { openai } from "@/lib/openai/client"

const execFileAsync = promisify(execFile)
const FFMPEG_BINARY = "ffmpeg"
const FFPROBE_BINARY = "ffprobe"
const MAX_TRANSCRIPTION_UPLOAD_BYTES = 25 * 1024 * 1024
const CHUNK_DURATION_SECONDS = 10 * 60

type TranscriptSegment = {
  start: number
  text: string
}

type TranscriptChunk = {
  path: string
  startSeconds: number
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

async function getAudioDurationSeconds(audioPath: string) {
  const { stdout } = await execFileAsync(
    FFPROBE_BINARY,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ],
    {
      maxBuffer: 1024 * 1024,
    }
  )

  const durationSeconds = Number.parseFloat(stdout.trim())

  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : null
}

async function transcribeSingleAudioFile(
  audioPath: string,
  startOffsetSeconds = 0
) {
  const transcription = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  })

  const segments = Array.isArray(transcription.segments)
    ? transcription.segments
        .map((segment) => ({
          start: segment.start + startOffsetSeconds,
          text: segment.text,
        }))
        .filter((segment) => segment.text.trim().length > 0)
    : []

  const plainText = transcription.text.trim()

  return {
    plainText,
    segments,
  }
}

async function createChunkFile(
  sourceAudioPath: string,
  chunkPath: string,
  startSeconds: number,
  durationSeconds: number
) {
  await execFileAsync(
    FFMPEG_BINARY,
    [
      "-v",
      "error",
      "-y",
      "-i",
      sourceAudioPath,
      "-ss",
      String(startSeconds),
      "-t",
      String(durationSeconds),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      chunkPath,
    ],
    {
      maxBuffer: 10 * 1024 * 1024,
    }
  )
}

async function splitAudioIntoChunks(
  sourceAudioPath: string,
  totalDurationSeconds: number
) {
  const chunkDirectory = await mkdtemp(path.join(tmpdir(), "knowledge-audio-"))
  const chunks: TranscriptChunk[] = []

  try {
    for (
      let startSeconds = 0, chunkIndex = 0;
      startSeconds < totalDurationSeconds;
      startSeconds += CHUNK_DURATION_SECONDS, chunkIndex += 1
    ) {
      const currentChunkDuration = Math.min(
        CHUNK_DURATION_SECONDS,
        totalDurationSeconds - startSeconds
      )
      const chunkPath = path.join(
        chunkDirectory,
        `chunk-${chunkIndex.toString().padStart(4, "0")}.mp3`
      )

      await createChunkFile(
        sourceAudioPath,
        chunkPath,
        startSeconds,
        currentChunkDuration
      )

      const chunkStats = await stat(chunkPath)

      if (chunkStats.size > MAX_TRANSCRIPTION_UPLOAD_BYTES) {
        throw new Error(
          "An audio chunk still exceeded the transcription upload limit after chunking."
        )
      }

      chunks.push({
        path: chunkPath,
        startSeconds,
      })
    }

    return {
      chunks,
      cleanup: async () => {
        await rm(chunkDirectory, { force: true, recursive: true })
      },
    }
  } catch (error) {
    await rm(chunkDirectory, { force: true, recursive: true })
    throw error
  }
}

export async function transcribeAudioFile(
  audioPath: string,
  knownDurationSeconds?: number | null
) {
  const audioStats = await stat(audioPath)

  if (audioStats.size <= MAX_TRANSCRIPTION_UPLOAD_BYTES) {
    const transcription = await transcribeSingleAudioFile(audioPath)

    const formattedTranscript =
      transcription.segments.length > 0
        ? formatSegmentTranscript(transcription.segments)
        : transcription.plainText

    if (!formattedTranscript) {
      throw new Error(
        "The transcription response did not include transcript text."
      )
    }

    return {
      formattedTranscript,
      plainText: transcription.plainText,
      segments: transcription.segments,
    }
  }

  const resolvedDurationSeconds =
    typeof knownDurationSeconds === "number" && knownDurationSeconds > 0
      ? knownDurationSeconds
      : await getAudioDurationSeconds(audioPath)

  if (!resolvedDurationSeconds) {
    throw new Error(
      "The audio file exceeded the transcription upload limit and could not be chunked automatically."
    )
  }

  const chunkedAudio = await splitAudioIntoChunks(
    audioPath,
    resolvedDurationSeconds
  )

  try {
    const allSegments: TranscriptSegment[] = []
    const plainTextParts: string[] = []

    for (const chunk of chunkedAudio.chunks) {
      const transcription = await transcribeSingleAudioFile(
        chunk.path,
        chunk.startSeconds
      )

      if (transcription.plainText) {
        plainTextParts.push(transcription.plainText)
      }

      if (transcription.segments.length > 0) {
        allSegments.push(...transcription.segments)
      } else if (transcription.plainText) {
        allSegments.push({
          start: chunk.startSeconds,
          text: transcription.plainText,
        })
      }
    }

    const sortedSegments = [...allSegments].sort(
      (left, right) => left.start - right.start
    )
    const plainText = plainTextParts.join("\n").trim()
    const formattedTranscript =
      sortedSegments.length > 0
        ? formatSegmentTranscript(sortedSegments)
        : plainText

    if (!formattedTranscript) {
      throw new Error(
        "The transcription response did not include transcript text."
      )
    }

    return {
      formattedTranscript,
      plainText,
      segments: sortedSegments,
    }
  } finally {
    await chunkedAudio.cleanup()
  }
}
