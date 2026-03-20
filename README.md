# Admin Dashboard

This project manages transcript-backed knowledge files and now includes an
embeddable website chat widget powered by the existing OpenAI agent.

## Widget Setup

Add these environment variables:

```env
WIDGET_SIGNING_SECRET=replace-with-a-long-random-secret
WIDGET_SITE_CONFIGS=[
  {
    "siteKey": "demo-site",
    "origins": ["http://localhost:3000", "https://example.com"],
    "title": "SandraStone Assistant",
    "placeholder": "Ask about the videos..."
  }
]
```

`WIDGET_SITE_CONFIGS` must be valid JSON. Each entry defines the public
`siteKey`, the exact allowed origins, and optional UI copy for the iframe.

## Widget Embed

Load the widget on an allowed website with:

```html
<script
  src="https://your-dashboard-domain.com/widget/embed"
  data-site-key="demo-site"
  data-position="bottom-right"
></script>
```

The loader exposes `window.SandraStoneWidget` with:

```ts
window.SandraStoneWidget.open()
window.SandraStoneWidget.close()
window.SandraStoneWidget.toggle()
window.SandraStoneWidget.sendMessage("What does the video say about entries?")
const unsubscribe = window.SandraStoneWidget.on("ready", () => {})
```

Supported events: `ready`, `open`, `close`, `message_sent`, `error`.
