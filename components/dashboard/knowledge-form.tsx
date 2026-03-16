"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import {
  createKnowledgeAction,
  type CreateKnowledgeActionState,
} from "@/app/actions/knowledge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const initialState: CreateKnowledgeActionState = {
  topicName: "",
  videoUrl: "",
  error: "",
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="lg"
      className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-900"
      disabled={pending}
    >
      {pending ? "Submitting..." : "Submit"}
    </Button>
  )
}

export function KnowledgeForm() {
  const [state, formAction] = useActionState(
    createKnowledgeAction,
    initialState
  )

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="topicName"
          className="block text-sm font-medium text-foreground"
        >
          Topic Name
        </label>
        <Input
          id="topicName"
          name="topicName"
          type="text"
          placeholder="Knowledge topic name"
          defaultValue={state.topicName}
          required
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="videoUrl"
          className="block text-sm font-medium text-foreground"
        >
          Video URL
        </label>
        <Input
          id="videoUrl"
          name="videoUrl"
          type="url"
          placeholder="https://example.com/video"
          defaultValue={state.videoUrl}
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : (
        <p className="text-sm leading-6 text-slate-600">
          New uploads start with the <span className="font-medium">in_progress</span>{" "}
          status until the real vector store integration updates them.
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
