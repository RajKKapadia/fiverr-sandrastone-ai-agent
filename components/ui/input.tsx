import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-2xl border border-border/70 bg-background/90 px-4 text-sm text-foreground shadow-sm transition outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/20 focus-visible:ring-4 focus-visible:ring-foreground/5 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
