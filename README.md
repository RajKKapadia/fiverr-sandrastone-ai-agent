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

Requests are accepted only from browser origins listed in
`WIDGET_SITE_CONFIGS`. The route now handles CORS preflight with `OPTIONS` and
does not require an `Authorization` bearer token.

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

Browser clients must send the request from an allowed `Origin` with
`Content-Type: application/json`.

## Streaming Widget Chat API

Use `POST /api/widget/chat/stream` to stream the assistant reply. The widget
keeps chat history in the browser and sends that history with each request.

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

The embedded iframe uses the signed widget bearer token from bootstrap for this
route. There is no server-side chat history endpoint anymore.

## Docker

Build and run only the web app on port `4100`:

```bash
docker build --target web -t admin-dashboard-web .
docker run --env-file .env -p 4100:4100 admin-dashboard-web
```

Run the Discord bot as its own container:

```bash
docker build --target discord -t admin-dashboard-discord .
docker run --env-file .env admin-dashboard-discord
```

Run both services together with Docker Compose:

```bash
docker compose up --build -d
```

This starts:

- `web` on port `4100`
- `discord` as a background bot worker

Both services use the same `.env` file. The containers expect the same runtime
environment variables as the local app, including `OPENAI_API_KEY`,
`OPENAI_VECTOR_STORE_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`WIDGET_SIGNING_SECRET`, `WIDGET_SITE_CONFIGS`, and the Discord bot variables.
