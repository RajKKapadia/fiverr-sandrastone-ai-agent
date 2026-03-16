import { createHmac, timingSafeEqual } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { serverEnv } from "@/data/env/server"

const SESSION_COOKIE_NAME = "admin_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function createSessionToken() {
  return createHmac(
    "sha256",
    `${serverEnv.ADMIN_EMAIL}:${serverEnv.ADMIN_PASSWORD}`
  )
    .update(normalizeEmail(serverEnv.ADMIN_EMAIL))
    .digest("base64url")
}

export function validateAdminCredentials(email: string, password: string) {
  return (
    safeEqual(normalizeEmail(email), normalizeEmail(serverEnv.ADMIN_EMAIL)) &&
    safeEqual(password, serverEnv.ADMIN_PASSWORD)
  )
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies()
  const currentSession = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!currentSession) {
    return false
  }

  return safeEqual(currentSession, createSessionToken())
}

export async function requireAdminAuthentication() {
  if (!(await isAdminAuthenticated())) {
    redirect("/")
  }
}

export async function createAdminSession() {
  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()

  cookieStore.delete(SESSION_COOKIE_NAME)
}
