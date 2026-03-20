import "server-only"

import type { AgentInputItem, Session } from "@openai/agents"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/drizzle/db"
import { sessionItems, sessions } from "@/drizzle/schema"

type SessionIdentifier = {
  sessionId: string
}

function asAgentInputItem(value: unknown) {
  if (!value || typeof value !== "object") {
    return null
  }

  return value as AgentInputItem
}

export class DatabaseSessionStore implements Session {
  private cachedSessionId: string | null = null

  constructor(private readonly userId: string) {}

  private async ensureSession(): Promise<SessionIdentifier> {
    if (this.cachedSessionId) {
      return { sessionId: this.cachedSessionId }
    }

    const existing = await db
      .select({ sessionId: sessions.sessionId })
      .from(sessions)
      .where(eq(sessions.userId, this.userId))
      .limit(1)

    const match = existing[0]

    if (match) {
      this.cachedSessionId = match.sessionId
      return match
    }

    const sessionId = crypto.randomUUID()

    try {
      await db.insert(sessions).values({
        sessionId,
        userId: this.userId,
      })
      this.cachedSessionId = sessionId
      return { sessionId }
    } catch {
      const retry = await db
        .select({ sessionId: sessions.sessionId })
        .from(sessions)
        .where(eq(sessions.userId, this.userId))
        .limit(1)

      if (!retry[0]) {
        throw new Error("Failed to initialize session storage.")
      }

      this.cachedSessionId = retry[0].sessionId
      return retry[0]
    }
  }

  async getSessionId() {
    const session = await this.ensureSession()
    return session.sessionId
  }

  async getItems(limit?: number) {
    const sessionId = await this.getSessionId()

    const rows =
      typeof limit === "number"
        ? await db
            .select({
              itemData: sessionItems.itemData,
            })
            .from(sessionItems)
            .where(eq(sessionItems.sessionId, sessionId))
            .orderBy(desc(sessionItems.sequence))
            .limit(limit)
        : await db
            .select({
              itemData: sessionItems.itemData,
            })
            .from(sessionItems)
            .where(eq(sessionItems.sessionId, sessionId))
            .orderBy(asc(sessionItems.sequence))

    const orderedRows = typeof limit === "number" ? rows.reverse() : rows

    return orderedRows
      .map((row) => asAgentInputItem(row.itemData))
      .filter((item): item is AgentInputItem => item !== null)
  }

  async addItems(items: AgentInputItem[]) {
    if (items.length === 0) {
      return
    }

    const sessionId = await this.getSessionId()
    const [sequenceRow] = await db
      .select({
        maxSequence:
          sql<number>`coalesce(max(${sessionItems.sequence}), 0)`.mapWith(Number),
      })
      .from(sessionItems)
      .where(eq(sessionItems.sessionId, sessionId))

    const startingSequence = sequenceRow?.maxSequence ?? 0

    await db.insert(sessionItems).values(
      items.map((item, index) => ({
        itemData: item as unknown as Record<string, unknown>,
        sequence: startingSequence + index + 1,
        sessionId,
      }))
    )

    await db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.sessionId, sessionId))
  }

  async popItem() {
    const sessionId = await this.getSessionId()
    const rows = await db
      .select({
        id: sessionItems.id,
        itemData: sessionItems.itemData,
      })
      .from(sessionItems)
      .where(eq(sessionItems.sessionId, sessionId))
      .orderBy(desc(sessionItems.sequence))
      .limit(1)

    const match = rows[0]

    if (!match) {
      return undefined
    }

    await db
      .delete(sessionItems)
      .where(
        and(eq(sessionItems.id, match.id), eq(sessionItems.sessionId, sessionId))
      )

    return asAgentInputItem(match.itemData) ?? undefined
  }

  async clearSession() {
    const sessionId = await this.getSessionId()

    await db.delete(sessionItems).where(eq(sessionItems.sessionId, sessionId))
    await db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.sessionId, sessionId))
  }
}
