"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { loginAction, type LoginActionState } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const initialState: LoginActionState = {
  email: "",
  error: "",
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="lg"
      className="h-11 w-full rounded-2xl bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:bg-slate-800"
      disabled={pending}
    >
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="admin@company.com"
          defaultValue={state.email}
          required
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </div>

      <div className="space-y-3">
        {state.error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Use the admin credentials configured in your environment.
          </p>
        )}
        <SubmitButton />
      </div>
    </form>
  )
}
