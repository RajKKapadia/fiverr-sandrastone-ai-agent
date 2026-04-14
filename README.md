# Admin Dashboard

This project manages transcript-backed knowledge files and now includes an
embeddable website chat widget powered by the existing OpenAI agent.

## Discord Bot Setup

Add these environment variables for the Discord bot:

```env
DISCORD_BOT_TOKEN=replace-with-your-bot-token
DISCORD_APPLICATION_ID=replace-with-your-application-id
DISCORD_ALLOWED_GUILD_IDS=123456789012345678
DISCORD_ALLOWED_CHANNEL_IDS=234567890123456789
```

`DISCORD_ALLOWED_GUILD_IDS` and `DISCORD_ALLOWED_CHANNEL_IDS` accept comma- or
newline-separated Discord IDs. The bot only responds to non-bot, non-empty
messages posted in the configured channel IDs.

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

## Non-Streaming Widget Chat API

Use `POST /api/widget/chat` to send the current query together with prior chat
history and receive a single assistant reply.

Request body:

```json
{
  "message": "What does Sandra say about broker application secrets?",
  "history": [
    {
      "role": "user",
      "content": "Hi"
    },
    {
      "role": "assistant",
      "content": "Hello, how can I help?"
    }
  ]
}
```

Response body:

```json
{
  "message": {
    "id": "generated-message-id",
    "role": "assistant",
    "content": "..."
  }
}
```

The request uses the same bearer token as `/api/widget/history` and
`/api/widget/chat/stream`.

## Docker

Build and run the app in Docker on port `4100`:

```bash
docker build -t admin-dashboard .
docker run --env-file .env -p 4100:4100 admin-dashboard
```

The container expects the same runtime environment variables as the local app,
including `OPENAI_API_KEY`, `OPENAI_VECTOR_STORE_ID`, `DATABASE_URL`,
`ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
