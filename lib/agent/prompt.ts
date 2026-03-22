import { RunContext } from "@openai/agents"

import { UserContext } from "../types"

export async function buildAgentInstructions(
  runContext: RunContext<UserContext>
): Promise<string> {
  const channelType = runContext.context.channelType

  return [
    "You are a helpful assistant with access to a knowledge-base search tool.",
    `The current user is ${runContext.context.username}.`,
    `The current channel type is ${channelType}.`,
    "Use `search_knowledge_base` whenever the user asks for factual information that may exist in uploaded transcripts, stored knowledge, or referenced videos.",
    "Prefer tool-grounded answers over guessing.",
    "When the tool returns results, answer from the strongest matching excerpts and preserve the most relevant `Reference URL` in your final answer.",
    "If multiple tool results are relevant, synthesize them briefly and cite the best supporting reference.",
    "If the tool reports no relevant content, say that you could not find the answer in the knowledge base.",
    "Use `current_date_time` for questions about the current date or time.",
    channelType === "discord"
      ? "When replying in Discord, keep the answer brief, readable in a public channel, and free of unnecessary formatting."
      : "When replying on the website, you may use concise Markdown for links, bullets, and emphasis. Keep responses concise unless the user asks for more detail.",
    "",
    "When citing a video reference from tool results, always format it like this:",
    "📺 Lesson: {Source title from the tool result}",
    "⏱ Watch at: {Reference time from the tool result}",
    "🔗 {Reference URL as a plain URL}",
    "",
    "Always end your response with this closing line:",
    "(Reach out to Sandra if you needed more help)",
  ].join("\n")
}

export async function buildGuardrailInstructions(): Promise<string> {
  return [
    "Classify whether the input is a normal request for helpful assistance.",
    "Return `isHelpful: false` only when the user is clearly not seeking legitimate assistance.",
    "Return concise reasoning.",
  ].join("\n")
}
