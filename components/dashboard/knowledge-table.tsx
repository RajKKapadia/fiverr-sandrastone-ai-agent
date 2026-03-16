import Link from "next/link"

import { DeleteKnowledgeButton } from "@/components/dashboard/delete-knowledge-button"
import { Button } from "@/components/ui/button"
import type { KnowledgeItem, KnowledgeStatus } from "@/lib/knowledge/types"

type KnowledgeTableProps = {
  items: KnowledgeItem[]
}

const statusStyles: Record<KnowledgeStatus, string> = {
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-900",
  cancelled: "border-slate-200 bg-slate-100 text-slate-700",
  failed: "border-rose-200 bg-rose-50 text-rose-900",
}

function formatStatusLabel(status: KnowledgeStatus) {
  return status.replace("_", " ")
}

export function KnowledgeTable({ items }: KnowledgeTableProps) {
  if (!items.length) {
    return (
      <section className="rounded-[2rem] border border-dashed border-slate-900/15 bg-white/60 p-10 text-center shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Existing Knowledge
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          No files uploaded yet.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Add the first knowledge item to populate the dashboard.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] border border-slate-900/10 bg-white/70 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-900/10 px-6 py-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
              Existing Knowledge
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {items.length} file{items.length === 1 ? "" : "s"}
            </h2>
          </div>
          <p className="hidden text-sm text-slate-500 md:block">
            Transcript access unlocks when a file reaches completed.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/[0.03] text-slate-600">
              <tr>
                <th className="px-6 py-4 font-medium">Topic Name</th>
                <th className="px-6 py-4 font-medium">Video URL</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-900/10 align-top"
                >
                  <td className="px-6 py-5">
                    <div>
                      <p className="font-medium text-slate-950">
                        {item.topicName}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Added {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <a
                      href={item.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
                    >
                      {item.videoUrl}
                    </a>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusStyles[item.status]}`}
                    >
                      {formatStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-wrap gap-3">
                      {item.status === "completed" ? (
                        <Button
                          asChild
                          size="sm"
                          variant="dark"
                          className="rounded-xl shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
                        >
                          <Link href={`/dashboard/transcripts/${item.id}`}>
                            View Transcript
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          disabled
                        >
                          View Transcript
                        </Button>
                      )}
                      <DeleteKnowledgeButton
                        id={item.id}
                        topicName={item.topicName}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
