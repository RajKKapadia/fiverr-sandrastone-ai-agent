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
          type="button"
          asChild
          size="lg"
          variant="dark"
          className="h-11 rounded-2xl px-5 shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
        >
          <Link href="/dashboard/add">Add Knowledge</Link>
        </Button>
      }
    >
      <KnowledgeTable items={knowledgeItems} />
    </DashboardShell>
  )
}
