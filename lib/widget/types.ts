export const WIDGET_INIT_MESSAGE_TYPE = "sandrastone-widget:init"
export const WIDGET_HOST_COMMAND_TYPE = "sandrastone-widget:host-command"
export const WIDGET_READY_EVENT_TYPE = "sandrastone-widget:ready"
export const WIDGET_STATE_EVENT_TYPE = "sandrastone-widget:state"
export const WIDGET_EMIT_EVENT_TYPE = "sandrastone-widget:event"

export type WidgetSiteConfig = {
  siteKey: string
  origins: string[]
  title: string
  placeholder: string
}

export type WidgetBootstrapRequest = {
  browserSessionId: string
  siteKey: string
}

export type WidgetBootstrapResponse = {
  frameUrl: string
  site: Pick<WidgetSiteConfig, "placeholder" | "siteKey" | "title">
  token: string
}

export type WidgetMessageRole = "assistant" | "user"

export type WidgetMessage = {
  content: string
  id: string
  role: WidgetMessageRole
}

export type WidgetChatHistoryEntry = Pick<WidgetMessage, "content" | "role">

export type WidgetHistoryResponse = {
  messages: WidgetMessage[]
}

export type WidgetChatStreamRequest = {
  message: string
}

export type WidgetChatRequest = {
  history: WidgetChatHistoryEntry[]
  message: string
}

export type WidgetChatResponse = {
  message: WidgetMessage
}

export type WidgetSessionClaims = {
  browserSessionId: string
  expiresAt: number
  issuedAt: number
  parentOrigin: string
  siteKey: string
  version: 1
}

export type WidgetInitMessage = {
  site: Pick<WidgetSiteConfig, "placeholder" | "siteKey" | "title">
  token: string
  type: typeof WIDGET_INIT_MESSAGE_TYPE
}

export type WidgetHostCommand =
  | {
      command: "close" | "open" | "toggle"
      type: typeof WIDGET_HOST_COMMAND_TYPE
    }
  | {
      command: "sendMessage"
      text: string
      type: typeof WIDGET_HOST_COMMAND_TYPE
    }

export type WidgetReadyEvent = {
  siteKey: string
  type: typeof WIDGET_READY_EVENT_TYPE
}

export type WidgetStateEvent = {
  isOpen: boolean
  type: typeof WIDGET_STATE_EVENT_TYPE
}

export type WidgetNamedEvent = {
  detail?: Record<string, unknown>
  name: "close" | "error" | "message_sent" | "open" | "ready"
  type: typeof WIDGET_EMIT_EVENT_TYPE
}
