import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { KnowledgeTable } from "@/components/dashboard/knowledge-table"
import { Button } from "@/components/ui/button"
import { requireAdminAuthentication } from "@/lib/auth"
import { getKnowledgeItem, listKnowledgeItems } from "@/lib/knowledge/server"

type DashboardPageProps = {
  searchParams: Promise<{
    created?: string
  }>
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  noStore()
  await requireAdminAuthentication()
  const { created } = await searchParams
  const knowledgeItems = await listKnowledgeItems()

  if (created && !knowledgeItems.some((item) => item.id === created)) {
    const createdKnowledgeItem = await getKnowledgeItem(created)

    if (createdKnowledgeItem) {
      knowledgeItems.unshift(createdKnowledgeItem)
    }
  }

  return (
    <DashboardShell
      eyebrow="Dashboard"
      title="Knowledge files"
      description="Review the current vector store uploads, add a new knowledge file, inspect completed transcripts, or remove an item from the list."
      actions={
        <Button
          asChild
          size="lg"
          className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-900"
        >
          <Link href="/dashboard/add">Add Knowledge</Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <KnowledgeTable items={knowledgeItems} />

        <section className="space-y-4">
          <article className="rounded-[2rem] border border-slate-900/10 bg-slate-950 p-8 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-300">
              Vector store status
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              File lifecycle is now live.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              New submissions now run the full pipeline: download audio with
              yt-dlp, transcribe it with OpenAI, upload the transcript file, and
              attach it to your vector store with metadata attributes.
            </p>
          </article>

          <article className="rounded-[2rem] border border-slate-900/10 bg-white/70 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
              Action rules
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Transcript access is gated by status.
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
              <li>Completed files can open the transcript page.</li>
              <li>In-progress, cancelled, and failed files keep the action disabled.</li>
              <li>Delete removes the vector store file first and then deletes the uploaded file.</li>
            </ul>
          </article>
        </section>
      </div>
    </DashboardShell>
  )
}
