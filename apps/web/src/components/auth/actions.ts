"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithProvider(providerId: string) {
  await signIn(providerId, { redirectTo: "/dashboard" });
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await signIn("resend", { email, redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/dashboard" });
}
