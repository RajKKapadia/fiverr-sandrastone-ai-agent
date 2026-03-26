"use client"

import {
  ChatCircleDots,
  PaperPlaneTilt,
  SpinnerGap,
  X,
} from "@phosphor-icons/react"
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import type {
  WidgetHistoryResponse,
  WidgetHostCommand,
  WidgetInitMessage,
  WidgetMessage,
  WidgetNamedEvent,
  WidgetReadyEvent,
  WidgetStateEvent,
} from "@/lib/widget/types"
import {
  WIDGET_EMIT_EVENT_TYPE,
  WIDGET_HOST_COMMAND_TYPE,
  WIDGET_INIT_MESSAGE_TYPE,
  WIDGET_READY_EVENT_TYPE,
  WIDGET_STATE_EVENT_TYPE,
} from "@/lib/widget/types"

import { WidgetMarkdown } from "./widget-markdown"

type WidgetFrameProps = {
  siteKey: string
}

type WidgetSiteState = {
  placeholder: string
  siteKey: string
  title: string
}

const DEFAULT_SITE_STATE: WidgetSiteState = {
  placeholder: "Ask about the videos...",
  siteKey: "",
  title: "SandraStone Assistant",
}

function createMessage(role: WidgetMessage["role"], content: string): WidgetMessage {
  return {
    content,
    id: crypto.randomUUID(),
    role,
  }
}

function getEventErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}

async function readEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: string, payload: unknown) => void
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const flushChunk = (chunk: string) => {
    const lines = chunk.split(/\r?\n/)
    let eventName = "message"
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim())
      }
    }

    const payloadText = dataLines.join("\n")
    onEvent(eventName, payloadText ? JSON.parse(payloadText) : null)
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, {
      stream: true,
    })

    let boundaryIndex = buffer.indexOf("\n\n")

    while (boundaryIndex >= 0) {
      const chunk = buffer.slice(0, boundaryIndex).trim()
      buffer = buffer.slice(boundaryIndex + 2)

      if (chunk) {
        flushChunk(chunk)
      }

      boundaryIndex = buffer.indexOf("\n\n")
    }
  }

  const trailingChunk = buffer.trim()

  if (trailingChunk) {
    flushChunk(trailingChunk)
  }
}

function isWidgetInitMessage(value: unknown): value is WidgetInitMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === WIDGET_INIT_MESSAGE_TYPE
  )
}

function isWidgetHostCommand(value: unknown): value is WidgetHostCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === WIDGET_HOST_COMMAND_TYPE
  )
}

export function WidgetFrame({ siteKey }: WidgetFrameProps) {
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [site, setSite] = useState<WidgetSiteState>({
    ...DEFAULT_SITE_STATE,
    siteKey,
  })
  const [token, setToken] = useState<string | null>(null)

  const expectedParentOriginRef = useRef<string | null>(null)
  const inputValueRef = useRef(inputValue)
  const isStreamingRef = useRef(isStreaming)
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef(token)

  function postToParent(
    payload: WidgetNamedEvent | WidgetReadyEvent | WidgetStateEvent
  ) {
    const targetOrigin = expectedParentOriginRef.current ?? "*"
    window.parent.postMessage(payload, targetOrigin)
  }

  function emitNamedEvent(
    name: WidgetNamedEvent["name"],
    detail?: WidgetNamedEvent["detail"]
  ) {
    postToParent({
      detail,
      name,
      type: WIDGET_EMIT_EVENT_TYPE,
    })
  }

  const loadHistory = useEffectEvent(async (nextToken: string) => {
    setIsHistoryLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/widget/history", {
        headers: {
          Authorization: `Bearer ${nextToken}`,
        },
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to load chat history."
        )
      }

      startTransition(() => {
        setMessages((payload as WidgetHistoryResponse).messages)
      })
      emitNamedEvent("ready")
    } catch (historyError) {
      const message = getEventErrorMessage(historyError)
      setError(message)
      emitNamedEvent("error", {
        message,
      })
    } finally {
      setIsHistoryLoading(false)
    }
  })

  async function submitMessage(sourceText?: string) {
    const nextToken = tokenRef.current
    const text = (sourceText ?? inputValueRef.current).trim()

    if (!nextToken || !text || isStreamingRef.current) {
      return
    }

    setError(null)
    setInputValue("")
    setIsOpen(true)

    const userMessage = createMessage("user", text)
    const assistantMessage = createMessage("assistant", "")

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      assistantMessage,
    ])
    setIsStreaming(true)
    emitNamedEvent("message_sent", {
      content: text,
    })

    try {
      const response = await fetch("/api/widget/chat/stream", {
        body: JSON.stringify({
          message: text,
        }),
        headers: {
          Authorization: `Bearer ${nextToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      })

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to stream chat response."
        )
      }

      let streamError: string | null = null

      await readEventStream(response.body, (event, payload) => {
        if (event === "text_delta") {
          const delta =
            payload &&
            typeof payload === "object" &&
            "delta" in payload &&
            typeof payload.delta === "string"
              ? payload.delta
              : ""

          if (!delta) {
            return
          }

          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: `${message.content}${delta}`,
                  }
                : message
            )
          )
          return
        }

        if (event === "message_done") {
          const content =
            payload &&
            typeof payload === "object" &&
            "message" in payload &&
            payload.message &&
            typeof payload.message === "object" &&
            "content" in payload.message &&
            typeof payload.message.content === "string"
              ? payload.message.content
              : ""

          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: content || message.content,
                  }
                : message
            )
          )
          return
        }

        if (event === "error") {
          streamError =
            payload &&
            typeof payload === "object" &&
            "message" in payload &&
            typeof payload.message === "string"
              ? payload.message
              : "Failed to stream chat response."
        }
      })

      if (streamError) {
        throw new Error(streamError)
      }
    } catch (streamError) {
      const message = getEventErrorMessage(streamError)
      setError(message)
      emitNamedEvent("error", {
        message,
      })
      setMessages((currentMessages) =>
        currentMessages.filter((messageItem) => messageItem.id !== assistantMessage.id)
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const handleWindowMessage = useEffectEvent((event: MessageEvent) => {
    if (event.source !== window.parent) {
      return
    }

    const payload = event.data

    if (isWidgetInitMessage(payload)) {
      expectedParentOriginRef.current = event.origin
      setToken(payload.token)
      setSite(payload.site)
      void loadHistory(payload.token)
      return
    }

    if (!isWidgetHostCommand(payload)) {
      return
    }

    if (payload.command === "open") {
      setIsOpen(true)
      return
    }

    if (payload.command === "close") {
      setIsOpen(false)
      return
    }

    if (payload.command === "toggle") {
      setIsOpen((currentValue) => !currentValue)
      return
    }

    if (payload.command === "sendMessage") {
      void submitMessage(payload.text)
    }
  })

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    window.addEventListener("message", handleWindowMessage)
    postToParent({
      siteKey,
      type: WIDGET_READY_EVENT_TYPE,
    })

    return () => {
      window.removeEventListener("message", handleWindowMessage)
    }
  }, [siteKey])

  useEffect(() => {
    postToParent({
      isOpen,
      type: WIDGET_STATE_EVENT_TYPE,
    })
  }, [isOpen])

  useEffect(() => {
    const viewport = messagesViewportRef.current

    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [isOpen, isStreaming, messages])

  return (
    <div
      className={
        isOpen
          ? "flex h-[100svh] w-full items-end justify-end overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top,_rgba(245,180,123,0.2),_transparent_38%),linear-gradient(180deg,#fffaf3_0%,#f5efe5_100%)] p-0"
          : "flex h-[100svh] w-full items-end justify-end bg-transparent p-0"
      }
    >
      {isOpen ? (
        <section className="flex h-full w-full flex-col overflow-hidden rounded-[2rem] border border-[#d8c7b2] bg-[radial-gradient(circle_at_top,_rgba(245,180,123,0.2),_transparent_38%),linear-gradient(180deg,#fffaf3_0%,#f5efe5_100%)]">
          <header className="relative overflow-hidden border-b border-[#e7d6c0] px-4 py-4 sm:px-5">
            <div className="absolute inset-x-0 top-0 h-full bg-[linear-gradient(135deg,rgba(157,79,31,0.08),rgba(251,191,36,0.02))]" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-[#8d6b52] sm:text-[0.68rem] sm:tracking-[0.28em]">
                  Trading Library
                </p>
                <h1 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">
                  {site.title}
                </h1>
                <p className="text-sm leading-6 text-slate-600">
                  Ask about the uploaded videos and source references.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full border-[#d6c1aa] bg-white/85 text-slate-700 shadow-sm hover:bg-white"
                onClick={() => setIsOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>

          <div
            ref={messagesViewportRef}
            className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4"
          >
            {isHistoryLoading ? (
              <div className="rounded-[1.75rem] border border-dashed border-[#d7c4ae] bg-white/55 p-5 text-sm text-slate-600">
                Loading chat history...
              </div>
            ) : null}

            {!isHistoryLoading && messages.length === 0 ? (
              <div className="rounded-[1.75rem] border border-[#dfccb6] bg-white/80 p-5 shadow-sm">
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#8d6b52]">
                  Start Here
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  Ask about any moment in the uploaded videos.
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  The assistant answers from the knowledge base and includes
                  clickable source links when relevant.
                </p>
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-5 rounded-[1.75rem] rounded-br-md bg-slate-950 px-4 py-3 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] sm:ml-10"
                    : "mr-5 rounded-[1.75rem] rounded-bl-md border border-[#e2d1bc] bg-white/88 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:mr-10"
                }
              >
                {message.role === "assistant" ? (
                  message.content ? (
                    <WidgetMarkdown content={message.content} />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <SpinnerGap className="size-4 animate-spin" />
                      Streaming response...
                    </div>
                  )
                ) : (
                  <p className="whitespace-pre-wrap text-[0.96rem] leading-7 text-white">
                    {message.content}
                  </p>
                )}
              </article>
            ))}
          </div>

          <footer className="border-t border-[#e7d6c0] bg-white/75 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-4 sm:py-4 sm:pb-4">
            {error ? (
              <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="rounded-[1.75rem] border border-[#dcc8b1] bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void submitMessage()
                  }
                }}
                placeholder={site.placeholder}
                rows={1}
                className="min-h-[64px] w-full resize-none border-0 bg-transparent px-3 py-3 text-[0.97rem] leading-7 text-slate-900 outline-none placeholder:text-slate-400 sm:min-h-[72px]"
              />

              <div className="flex flex-col gap-3 px-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-center text-[11px] font-medium uppercase tracking-[0.16em] text-[#8d6b52] sm:text-left sm:text-xs sm:tracking-[0.18em]">
                  Source links included
                </p>
                <Button
                  type="button"
                  variant="dark"
                  size="lg"
                  className="h-11 w-full justify-center rounded-full px-4 shadow-[0_14px_34px_rgba(15,23,42,0.18)] sm:w-auto"
                  disabled={!token || !inputValue.trim() || isStreaming}
                  onClick={() => void submitMessage()}
                >
                  {isStreaming ? (
                    <SpinnerGap className="size-4 animate-spin" />
                  ) : (
                    <PaperPlaneTilt className="size-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </footer>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex h-[84px] w-[84px] items-center justify-center rounded-full border border-[#d8c2ac] bg-[radial-gradient(circle_at_top,_#fff7ed,_#f4dcc5_62%,_#e7b888_100%)] text-slate-950 shadow-[0_18px_55px_rgba(15,23,42,0.22)] transition hover:scale-[1.02]"
        >
          <span className="sr-only">Open SandraStone chat widget</span>
          <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-slate-950 text-white shadow-inner transition group-hover:bg-slate-800">
            <ChatCircleDots className="size-8" />
          </div>
        </button>
      )}
    </div>
  )
}
