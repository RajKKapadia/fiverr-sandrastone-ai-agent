"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"

import { deleteKnowledgeAction } from "@/app/actions/knowledge"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

type DeleteKnowledgeButtonProps = {
  id: string
  topicName: string
}

function DeleteButtonInner() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="sm"
      variant="destructive"
      className="rounded-xl"
      disabled={pending}
    >
      {pending ? "Deleting..." : "Delete"}
    </Button>
  )
}

export function DeleteKnowledgeButton({
  id,
  topicName,
}: DeleteKnowledgeButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="destructive" className="rounded-xl">
          Delete
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete knowledge item?</AlertDialogTitle>
          <AlertDialogDescription>
            {`"${topicName}" will be removed from the vector store list, and the uploaded transcript file will be deleted afterwards.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" className="rounded-xl">
              Cancel
            </Button>
          </AlertDialogCancel>

          <form
            action={deleteKnowledgeAction}
            onSubmit={() => {
              setOpen(false)
            }}
          >
            <input type="hidden" name="id" value={id} />
            <DeleteButtonInner />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
