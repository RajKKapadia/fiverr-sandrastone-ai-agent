"use client"

import type { ReactNode } from "react"

function normalizeHref(href: string) {
  try {
    const url = new URL(href)

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString()
    }
  } catch {
    return null
  }

  return null
}

function renderInlineMarkdown(text: string) {
  const tokens: ReactNode[] = []
  const pattern =
    /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index))
    }

    if (match[2] && match[3]) {
      const href = normalizeHref(match[3])
      const label = match[2]

      tokens.push(
        href ? (
          <a
            key={`${match.index}-${href}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#9f4f1f] underline decoration-[#d49d7a] underline-offset-4 transition hover:text-[#7d3f18]"
          >
            {label}
          </a>
        ) : (
          label
        )
      )
    } else if (match[4]) {
      tokens.push(
        <code
          key={`${match.index}-code`}
          className="rounded-lg bg-slate-950 px-1.5 py-0.5 font-mono text-[0.82em] text-white"
        >
          {match[4]}
        </code>
      )
    } else if (match[5]) {
      tokens.push(
        <strong key={`${match.index}-strong`} className="font-semibold">
          {match[5]}
        </strong>
      )
    } else if (match[6]) {
      tokens.push(
        <em key={`${match.index}-em`} className="italic">
          {match[6]}
        </em>
      )
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex))
  }

  return tokens
}

function renderParagraph(text: string, key: string) {
  const lines = text.split("\n")

  return (
    <p key={key} className="leading-7 text-slate-700">
      {lines.map((line, index) => (
        <span key={`${key}-${index}`}>
          {index > 0 ? <br /> : null}
          {renderInlineMarkdown(line)}
        </span>
      ))}
    </p>
  )
}

function isUnorderedListLine(line: string) {
  return /^[-*]\s+/.test(line)
}

function isOrderedListLine(line: string) {
  return /^\d+\.\s+/.test(line)
}

export function WidgetMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let buffer: string[] = []
  let blockIndex = 0

  const flushParagraph = () => {
    if (!buffer.length) {
      return
    }

    blocks.push(renderParagraph(buffer.join("\n"), `paragraph-${blockIndex++}`))
    buffer = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd()

    if (!line.trim()) {
      flushParagraph()
      continue
    }

    if (isUnorderedListLine(line)) {
      flushParagraph()

      const items: string[] = [line.replace(/^[-*]\s+/, "")]

      while (
        index + 1 < lines.length &&
        isUnorderedListLine(lines[index + 1].trimEnd())
      ) {
        index += 1
        items.push(lines[index].trimEnd().replace(/^[-*]\s+/, ""))
      }

      blocks.push(
        <ul key={`list-${blockIndex++}`} className="space-y-2 pl-5 text-slate-700">
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`} className="list-disc leading-7">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (isOrderedListLine(line)) {
      flushParagraph()

      const items: string[] = [line.replace(/^\d+\.\s+/, "")]

      while (
        index + 1 < lines.length &&
        isOrderedListLine(lines[index + 1].trimEnd())
      ) {
        index += 1
        items.push(lines[index].trimEnd().replace(/^\d+\.\s+/, ""))
      }

      blocks.push(
        <ol key={`ordered-${blockIndex++}`} className="space-y-2 pl-5 text-slate-700">
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`} className="list-decimal leading-7">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    buffer.push(line)
  }

  flushParagraph()

  return <div className="space-y-4 text-[0.96rem]">{blocks}</div>
}
