const REQUEST_COOLDOWN_MS = 1_500

const inFlightRequests = new Set<string>()
const lastRequestAtByKey = new Map<string, number>()

export function getWidgetRequestBlockReason(key: string) {
  if (inFlightRequests.has(key)) {
    return "The previous widget request is still in progress."
  }

  const lastRequestAt = lastRequestAtByKey.get(key)

  if (!lastRequestAt) {
    return null
  }

  if (Date.now() - lastRequestAt < REQUEST_COOLDOWN_MS) {
    return "Please wait a moment before sending another message."
  }

  return null
}

export function beginWidgetRequest(key: string) {
  inFlightRequests.add(key)
  lastRequestAtByKey.set(key, Date.now())
}

export function endWidgetRequest(key: string) {
  inFlightRequests.delete(key)
}
