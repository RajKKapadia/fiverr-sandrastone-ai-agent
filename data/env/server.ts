/**
 * Server-side environment variables.
 * These are only available in server components, API routes, and server actions.
 * Never import this file from client components.
 */

function getServerEnv() {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL!,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD!,
    OPENAI_VECTOR_STORE_ID: process.env.OPENAI_VECTOR_STORE_ID!,
    DATABASE_URL: process.env.DATABASE_URL!,
    NODE_ENV: process.env.NODE_ENV!,
  } as const;
}

export type ServerEnv = ReturnType<typeof getServerEnv>;

export const serverEnv = getServerEnv();
