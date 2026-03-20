import { Agent } from "@openai/agents"

import { UserContext } from "../types"
import { AGENT_MODEL } from "./config"
import { helpfulInputGuardrail } from "./guardrail"
import { buildAgentInstructions } from "./prompt"
import { agentTools } from "./tool"

export const primaryAgent = new Agent<UserContext>({
  name: "Primary Agent",
  instructions: buildAgentInstructions,
  model: AGENT_MODEL,
  inputGuardrails: [helpfulInputGuardrail],
  tools: [...agentTools],
})

primaryAgent.on("agent_start", (ctx) => {
  console.log(`[Agent] Started for user: ${ctx.context.userId}`)
})

primaryAgent.on("agent_end", () => {
  console.log("[Agent] Ended")
})

primaryAgent.on("agent_tool_start", (_ctx, tool) => {
  console.log(`[Tool] ${tool.name} started`)
})

primaryAgent.on("agent_tool_end", (_ctx, tool) => {
  console.log(`[Tool] ${tool.name} ended`)
})
