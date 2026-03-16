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
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-slate-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
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

        <section className="rounded-[2rem] border border-slate-900/10 bg-slate-950 p-8 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-300">
            Pipeline
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            The form now runs the real ingestion flow.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            The server action validates the URL, fetches YouTube metadata,
            downloads the audio source, transcribes it into timestamped text,
            uploads the transcript file to OpenAI, attaches it to the vector
            store, and redirects back to the list.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-slate-200">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              New rows are created with <span className="font-medium">in_progress</span> while the vector store processes them.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Transcript text is stored as timestamped segments like <span className="font-medium">[start time: 12:19] ...</span>.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Metadata attributes include the source URL, title, topic name, and OpenAI file ID.
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
