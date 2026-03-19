import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/data/env/server';
import * as schema from '@/drizzle/schema';

const client = postgres(serverEnv.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { logger: serverEnv.NODE_ENV === 'development' ? true : false, schema });

export async function checkDatabaseHealth(): Promise<boolean> {
    try {
        await client`select 1`;
        return true;
    } catch {
        return false;
    }
}

export async function closeDatabase(): Promise<void> {
    await client.end();
}
