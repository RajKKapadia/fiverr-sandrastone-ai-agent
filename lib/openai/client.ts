import OpenAI from "openai"

import { serverEnv } from "@/data/env/server"

export const openai = new OpenAI({
  apiKey: serverEnv.OPENAI_API_KEY,
})
