import "server-only"

import { execFile } from "node:child_process"
import { stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const YT_DLP_BINARY = "yt-dlp"

type YoutubeMetadataResponse = {
  duration?: number
  id?: string
  title?: string
  webpage_url?: string
}

export type YoutubeVideoMetadata = {
  durationSeconds: number | null
  title: string
  videoId: string
  videoUrl: string
}

export type DownloadedYoutubeAudio = {
  audioPath: string
  cleanup: () => Promise<void>
  metadata: YoutubeVideoMetadata
}

async function runYtDlpCommand(args: string[]) {
  return execFileAsync(YT_DLP_BINARY, args, {
    maxBuffer: 20 * 1024 * 1024,
  })
}

function normalizeMetadata(
  sourceUrl: string,
  payload: YoutubeMetadataResponse
): YoutubeVideoMetadata {
  return {
    durationSeconds:
      typeof payload.duration === "number" ? payload.duration : null,
    title: payload.title?.trim() || "Untitled video",
    videoId: payload.id?.trim() || "unknown-video",
    videoUrl: payload.webpage_url?.trim() || sourceUrl,
  }
}

export async function getYoutubeVideoMetadata(
  videoUrl: string
): Promise<YoutubeVideoMetadata> {
  const { stdout } = await runYtDlpCommand([
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    videoUrl,
  ])

  const payload = JSON.parse(stdout) as YoutubeMetadataResponse

  return normalizeMetadata(videoUrl, payload)
}

export async function downloadYoutubeAudio(
  videoUrl: string
): Promise<DownloadedYoutubeAudio> {
  const metadata = await getYoutubeVideoMetadata(videoUrl)
  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "knowledge-audio-download-")
  )
  const outputTemplate = path.join(tempDirectory, "%(id)s.%(ext)s")

  const { stdout } = await runYtDlpCommand([
    "--no-playlist",
    "--no-warnings",
    "--quiet",
    "-f",
    "bestaudio/best",
    "-o",
    outputTemplate,
    "--print",
    "after_move:filepath",
    videoUrl,
  ])

  const audioPath = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)

  if (!audioPath) {
    await rm(tempDirectory, { force: true, recursive: true })
    throw new Error("yt-dlp did not return a downloaded audio path.")
  }

  await stat(audioPath)

  return {
    audioPath,
    cleanup: async () => {
      await rm(tempDirectory, { force: true, recursive: true })
    },
    metadata,
  }
}
