/**
 * Client-side environment variables.
 * Only NEXT_PUBLIC_ prefixed variables are available here.
 * Safe to import from both client and server components.
 */

function getClientEnv() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL!,
  } as const;
}

export type ClientEnv = ReturnType<typeof getClientEnv>;

export const clientEnv = getClientEnv();
