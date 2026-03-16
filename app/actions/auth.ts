"use server"

import { redirect } from "next/navigation"

import {
  clearAdminSession,
  createAdminSession,
  validateAdminCredentials,
} from "@/lib/auth"

export type LoginActionState = {
  email: string
  error: string
}

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return {
      email,
      error: "Enter both the admin email and password.",
    }
  }

  if (!validateAdminCredentials(email, password)) {
    return {
      email,
      error: "Invalid admin credentials.",
    }
  }

  await createAdminSession()
  redirect("/dashboard")
}

export async function logoutAction() {
  await clearAdminSession()
  redirect("/")
}
