// lib/adminAuth.ts
// One place that decides "is this the admin?", for /admin, its server
// actions, and every maintenance / debug API route.
//
// The session cookie's value is a hash of the admin password - NOT a fixed
// word. It used to be the literal string "authenticated", which meant anyone
// who set that cookie by hand in their browser was the admin (unlock picks,
// edit scores, record payments, see every player's private link). A hash
// can't be guessed without the password, and changing ADMIN_PASSWORD in
// Vercel logs every old session out.
import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "admin_session";

function sessionToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash("sha256").update(`cavepicks-admin-session:${pw}`).digest("hex") : null;
}

function same(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function passwordIsCorrect(password: unknown): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return typeof password === "string" && !!pw && same(password, pw);
}

/** Logged in at /admin on this browser? */
export async function isAdminSession(): Promise<boolean> {
  const token = sessionToken();
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!token && !!value && same(value, token);
}

export async function startAdminSession() {
  const token = sessionToken();
  if (!token) return;
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

/**
 * Gate for maintenance / debug API routes. Passes if the caller is logged in
 * at /admin in this browser, OR passes ?key=<ADMIN_PASSWORD>. Returns a 401
 * response to send back, or null when the caller is allowed through:
 *   const denied = await requireAdmin(request); if (denied) return denied;
 */
export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const key = new URL(request.url).searchParams.get("key");
  if (passwordIsCorrect(key) || (await isAdminSession())) return null;
  return NextResponse.json(
    { ok: false, error: "Admin only. Log in at /admin first, or add ?key=<admin password>." },
    { status: 401 }
  );
}
