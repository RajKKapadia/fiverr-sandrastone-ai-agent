import {
  WIDGET_EMIT_EVENT_TYPE,
  WIDGET_HOST_COMMAND_TYPE,
  WIDGET_INIT_MESSAGE_TYPE,
  WIDGET_READY_EVENT_TYPE,
  WIDGET_STATE_EVENT_TYPE,
} from "@/lib/widget/types"

export const dynamic = "force-dynamic"

function getEmbedScript() {
  return `
(() => {
  const currentScript = document.currentScript;

  if (!(currentScript instanceof HTMLScriptElement)) {
    return;
  }

  if (window.SandraStoneWidget && window.SandraStoneWidget.__installed) {
    return;
  }

  const siteKey = (currentScript.dataset.siteKey || "").trim();
  const widgetOrigin = new URL(currentScript.src, window.location.href).origin;
  const position = currentScript.dataset.position === "bottom-left" ? "bottom-left" : "bottom-right";
  const bootstrapUrl = widgetOrigin + "/api/widget/bootstrap";
  const listeners = new Map();
  const pendingCommands = [];
  let iframe = null;
  let isReady = false;
  let isOpen = false;
  let initPayload = null;

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return "widget-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getStorageKey() {
    return "sandrastone_widget_session:" + widgetOrigin + ":" + siteKey;
  }

  function getBrowserSessionId() {
    const fallback = createId();

    try {
      const storageKey = getStorageKey();
      const existing = window.localStorage.getItem(storageKey);

      if (existing) {
        return existing;
      }

      window.localStorage.setItem(storageKey, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  }

  function emit(name, detail) {
    const handlers = listeners.get(name);

    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(detail);
      } catch (error) {
        console.error("[SandraStone Widget] Event handler failed", error);
      }
    });
  }

  function setFrameBounds() {
    if (!iframe) {
      return;
    }

    const gutter = window.innerWidth < 640 ? 12 : 16;
    const isMobile = window.innerWidth < 640;
    const expandedWidth = isMobile ? window.innerWidth - gutter * 2 : 420;
    const expandedHeight = isMobile ? window.innerHeight - gutter * 2 : 680;

    iframe.style.width = (isOpen ? expandedWidth : 84) + "px";
    iframe.style.height = (isOpen ? expandedHeight : 84) + "px";
    iframe.style.pointerEvents = "auto";
    iframe.style.left = position === "bottom-left" ? gutter + "px" : "auto";
    iframe.style.right = position === "bottom-right" ? gutter + "px" : "auto";
    iframe.style.bottom = isMobile ? "max(12px, env(safe-area-inset-bottom))" : gutter + "px";
  }

  function postToFrame(message) {
    if (!iframe || !iframe.contentWindow || !isReady) {
      pendingCommands.push(message);
      return;
    }

    iframe.contentWindow.postMessage(message, widgetOrigin);
  }

  function ensureFrame(frameUrl) {
    if (iframe) {
      return iframe;
    }

    iframe = document.createElement("iframe");
    iframe.src = frameUrl;
    iframe.title = "SandraStone chat widget";
    iframe.setAttribute("aria-label", "SandraStone chat widget");
    iframe.style.position = "fixed";
    iframe.style.zIndex = "2147483000";
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.style.colorScheme = "light";
    iframe.style.display = "block";
    iframe.style.overflow = "hidden";
    iframe.style.borderRadius = "28px";
    iframe.style.boxShadow = "0 18px 70px rgba(15, 23, 42, 0.18)";
    iframe.style.transition = "width 180ms ease, height 180ms ease, box-shadow 180ms ease";
    iframe.style.maxWidth = "calc(100vw - 24px)";
    iframe.style.maxHeight = "calc(100vh - 24px)";
    setFrameBounds();
    document.body.appendChild(iframe);
    return iframe;
  }

  function handleHostState(nextIsOpen) {
    isOpen = Boolean(nextIsOpen);
    setFrameBounds();
    emit(isOpen ? "open" : "close");
  }

  function flushPendingCommands() {
    if (!iframe || !iframe.contentWindow || !isReady) {
      return;
    }

    while (pendingCommands.length > 0) {
      iframe.contentWindow.postMessage(pendingCommands.shift(), widgetOrigin);
    }
  }

  function openWidget() {
    handleHostState(true);
    postToFrame({ command: "open", type: "${WIDGET_HOST_COMMAND_TYPE}" });
  }

  function closeWidget() {
    handleHostState(false);
    postToFrame({ command: "close", type: "${WIDGET_HOST_COMMAND_TYPE}" });
  }

  function toggleWidget() {
    handleHostState(!isOpen);
    postToFrame({ command: "toggle", type: "${WIDGET_HOST_COMMAND_TYPE}" });
  }

  function sendMessage(text) {
    if (typeof text !== "string" || !text.trim()) {
      return;
    }

    openWidget();
    postToFrame({
      command: "sendMessage",
      text,
      type: "${WIDGET_HOST_COMMAND_TYPE}",
    });
  }

  function on(name, handler) {
    if (!listeners.has(name)) {
      listeners.set(name, new Set());
    }

    listeners.get(name).add(handler);

    return () => {
      listeners.get(name)?.delete(handler);
    };
  }

  function handleMessage(event) {
    if (!iframe || event.origin !== widgetOrigin || event.source !== iframe.contentWindow) {
      return;
    }

    const payload = event.data;

    if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
      return;
    }

    if (payload.type === "${WIDGET_READY_EVENT_TYPE}") {
      isReady = true;
      iframe.contentWindow.postMessage(initPayload, widgetOrigin);
      flushPendingCommands();
      return;
    }

    if (payload.type === "${WIDGET_STATE_EVENT_TYPE}") {
      handleHostState(Boolean(payload.isOpen));
      return;
    }

    if (payload.type === "${WIDGET_EMIT_EVENT_TYPE}") {
      emit(payload.name, payload.detail);
    }
  }

  async function bootstrap() {
    if (!siteKey) {
      console.error("[SandraStone Widget] Missing data-site-key attribute.");
      return;
    }

    const response = await fetch(bootstrapUrl, {
      body: JSON.stringify({
        browserSessionId: getBrowserSessionId(),
        siteKey,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      mode: "cors",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      throw new Error(payload && payload.error ? payload.error : "Widget bootstrap failed.");
    }

    const frameUrl = payload.frameUrl.startsWith("http")
      ? payload.frameUrl
      : widgetOrigin + payload.frameUrl;

    initPayload = {
      site: payload.site,
      token: payload.token,
      type: "${WIDGET_INIT_MESSAGE_TYPE}",
    };

    ensureFrame(frameUrl);
  }

  window.addEventListener("message", handleMessage);
  window.addEventListener("resize", setFrameBounds);

  window.SandraStoneWidget = {
    __installed: true,
    close: closeWidget,
    on,
    open: openWidget,
    sendMessage,
    toggle: toggleWidget,
  };

  bootstrap().catch((error) => {
    console.error("[SandraStone Widget] Bootstrap failed", error);
    emit("error", {
      message: error instanceof Error ? error.message : "Widget bootstrap failed.",
    });
  });
})();
`
}

export async function GET() {
  return new Response(getEmbedScript(), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  })
}
