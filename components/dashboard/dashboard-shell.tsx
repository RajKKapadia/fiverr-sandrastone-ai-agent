import Link from "next/link"

import { logoutAction } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"

type DashboardShellProps = {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
}

export function DashboardShell({
  eyebrow,
  title,
  description,
  children,
  actions,
  backHref,
  backLabel,
}: DashboardShellProps) {
  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.12),_transparent_35%),linear-gradient(180deg,#f8f4eb_0%,#efe7d8_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-[2rem] border border-slate-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              {backHref && backLabel ? (
                <Button
                  asChild
                  variant="dark"
                  size="sm"
                  className="h-10 rounded-xl px-4 shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
                >
                  <Link href={backHref}>{backLabel}</Link>
                </Button>
              ) : null}

              <div className="space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                  {eyebrow}
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                  {title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-700">
                  {description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {actions}
              <form action={logoutAction}>
                <Button
                  type="submit"
                  size="lg"
                  variant="dark"
                  className="h-11 rounded-2xl px-5 shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
                >
                  Log out
                </Button>
              </form>
            </div>
          </div>
        </header>

        {children}
      </div>
    </main>
  )
}
