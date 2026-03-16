import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { isAdminAuthenticated } from "@/lib/auth"

export default async function Page() {
  if (await isAdminAuthenticated()) {
    redirect("/dashboard")
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.08),_transparent_38%),linear-gradient(135deg,_#f7f5ef_0%,_#f0ece2_45%,_#e5ddcf_100%)] px-6 py-8 text-slate-950">
      <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(90,69,42,0.12),transparent)]" />
      <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="max-w-2xl space-y-8">
          <div className="inline-flex items-center rounded-full border border-slate-900/10 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 backdrop-blur">
            Admin access
          </div>
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">
              Sandrastone dashboard
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Sign in to manage the dashboard with your admin credentials.
            </h1>
            <p className="max-w-lg text-base leading-7 text-slate-700 sm:text-lg">
              This admin panel only accepts the email and password defined in
              your environment file. After a successful login, you&apos;ll be
              redirected to the dashboard automatically.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/70 bg-white/55 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-sm text-slate-500">Access</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                Admin only
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/55 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-sm text-slate-500">Session</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                Cookie based
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/55 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-sm text-slate-500">Destination</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                /dashboard
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/80 bg-white/80 p-8 shadow-[0_24px_100px_rgba(15,23,42,0.12)] backdrop-blur xl:p-10">
          <div className="mb-8 space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
              Login
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Welcome back
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              Enter the admin email and password from your environment
              variables.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  )
}
