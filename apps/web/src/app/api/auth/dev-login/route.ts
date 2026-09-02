import { NextResponse } from "next/server";
import { prisma } from "@synergilon/db";

import { isDevLoginEnabled } from "@/lib/env";

const DEV_EMAIL = "dev@synergilon.local";
const SESSION_DAYS = 30;

/**
 * GET /api/auth/dev-login — signs in a local development user without any
 * OAuth/email provider. Only active when AUTH_DEV_LOGIN=true (and, in
 * production builds, only for localhost requests). Creates a database session exactly like a real provider would,
 * so everything downstream (auth(), adapter, folders) behaves identically.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isDevLoginEnabled(url.host)) return new NextResponse("Not found", { status: 404 });

  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: "Dev User", emailVerified: new Date() },
  });
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const secure = url.protocol === "https:";
  const res = NextResponse.redirect(new URL("/dashboard", url), { status: 303 });
  res.cookies.set({
    // Auth.js cookie name; the __Secure- prefix is required on https.
    name: `${secure ? "__Secure-" : ""}authjs.session-token`,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
  return res;
}

export const dynamic = "force-dynamic";
