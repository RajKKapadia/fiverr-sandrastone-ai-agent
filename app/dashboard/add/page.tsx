import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { KnowledgeForm } from "@/components/dashboard/knowledge-form"
import { requireAdminAuthentication } from "@/lib/auth"

export default async function AddKnowledgePage() {
  await requireAdminAuthentication()

  return (
    <DashboardShell
      eyebrow="Add Knowledge"
      title="Create a new knowledge item"
      description="Submit a topic name and YouTube video URL. The server will download the audio, transcribe it, convert the segments into timestamped text, upload the transcript file, and attach it to the vector store."
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    >
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-slate-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Form
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Add Knowledge
        </h2>
        <div className="mt-6">
          <KnowledgeForm />
        </div>
      </section>
    </DashboardShell>
  )
}
