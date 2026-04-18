import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Debe coincidir con `COOKIE` en lib/auth/session.ts */
const SESSION_COOKIE = "lc_session";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsSession =
    path.startsWith("/app") || path.startsWith("/admin");
  if (!needsSession) {
    return NextResponse.next();
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
