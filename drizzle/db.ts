import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { serverEnv } from "@/data/env/server"
import * as schema from "@/drizzle/schema"

let client: ReturnType<typeof postgres> | null = null
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null

function getClient() {
  if (!client) {
    client = postgres(serverEnv.DATABASE_URL, { max: 1 })
  }

  return client
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getClient(), {
      logger: serverEnv.NODE_ENV === "development" ? true : false,
      schema,
    })
  }

  return dbInstance
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await getClient()`select 1`
    return true
  } catch {
    return false
  }
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end()
  }
}
