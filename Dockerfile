FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_AUTO_PIN=0

RUN npm install -g pnpm@9.15.9

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN NEXT_TELEMETRY_DISABLED=1 pnpm build

FROM base AS web

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4100
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 4100

CMD ["node", "server.js"]

FROM base AS discord

ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY data ./data
COPY drizzle ./drizzle
COPY lib ./lib

CMD ["pnpm", "discord:start"]
