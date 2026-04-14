import OpenAI from "openai"

let openaiClient: OpenAI | null = null

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    throw new Error(
      "Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable."
    )
  }

  return apiKey
}

function getOpenAiClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: getOpenAiApiKey(),
    })
  }

  return openaiClient
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, property, receiver) {
    return Reflect.get(getOpenAiClient(), property, receiver)
  },
})
