import { notFound } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { requireAdminAuthentication } from "@/lib/auth"
import {
  getKnowledgeItem,
  getKnowledgeTranscript,
} from "@/lib/knowledge/server"

type TranscriptPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function TranscriptPage({
  params,
}: TranscriptPageProps) {
  await requireAdminAuthentication()

  const { id } = await params
  const knowledgeItem = await getKnowledgeItem(id)

  if (!knowledgeItem) {
    notFound()
  }

  const transcript = await getKnowledgeTranscript(id)

  return (
    <DashboardShell
      eyebrow="View Transcript"
      title={knowledgeItem.topicName}
      description="This page renders the stored transcript file content for completed vector store items. Non-completed files remain visible, but the transcript stays unavailable until processing finishes."
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    >
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[2rem] border border-slate-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
            File details
          </p>
          <dl className="mt-6 space-y-5 text-sm">
            <div>
              <dt className="text-slate-500">Topic Name</dt>
              <dd className="mt-1 text-base font-medium text-slate-950">
                {knowledgeItem.topicName}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Video URL</dt>
              <dd className="mt-1 break-all text-base text-slate-950">
                <a
                  href={knowledgeItem.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700"
                >
                  {knowledgeItem.videoUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="mt-1 text-base font-medium capitalize text-slate-950">
                {knowledgeItem.status.replace("_", " ")}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-[2rem] border border-slate-900/10 bg-slate-950 p-8 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-300">
            Transcript
          </p>

          {transcript ? (
            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-100">
                {transcript.content}
              </pre>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Transcript not available yet
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                This file is currently marked as{" "}
                <span className="font-medium text-white">
                  {knowledgeItem.status.replace("_", " ")}
                </span>
                . Once the vector store finishes processing successfully, the
                transcript content will be available here automatically.
              </p>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  )
}
