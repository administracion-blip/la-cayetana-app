import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Debe coincidir con `COOKIE` en lib/auth/session.ts */
const SESSION_COOKIE = "lc_session";

/** Métodos que mutan estado: aplican al check Origin/Referer warn-only. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Salvavidas pasivo contra CSRF en las rutas `/api/admin/**`. En esta
 * fase no rechaza la petición: sólo registra un `console.warn` cuando
 * el Origin/Referer no encaja con el origen de la app. Tras varias
 * semanas de logs limpios podrá promocionarse a 403.
 *
 * Se acepta como "origen válido":
 *   - El propio `nextUrl.origin` de la petición (cubre dev, redes
 *     locales y previews sin necesidad de tocar `NEXT_PUBLIC_APP_URL`).
 *   - El origen derivado de `NEXT_PUBLIC_APP_URL` si está definido.
 */
function checkAdminMutationOrigin(request: NextRequest, path: string) {
  if (!path.startsWith("/api/admin/")) return;
  if (!MUTATING_METHODS.has(request.method)) return;

  const expectedOrigins = new Set<string>();
  expectedOrigins.add(request.nextUrl.origin);
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (envOrigin) {
    try {
      expectedOrigins.add(new URL(envOrigin).origin);
    } catch {
      /* envOrigin malformado: ignoramos para no romper middleware */
    }
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  let actualOrigin: string | null = originHeader;
  if (!actualOrigin && refererHeader) {
    try {
      actualOrigin = new URL(refererHeader).origin;
    } catch {
      /* referer malformado */
    }
  }

  if (!actualOrigin || !expectedOrigins.has(actualOrigin)) {
    // Importante: no incluimos cookies, JWT ni body. Solo metadatos
    // suficientes para correlacionar y descartar falsos positivos.
    console.warn(
      `[csrf][warn] admin mutation without matching origin path=${path} method=${request.method} origin=${originHeader ?? "<none>"} referer=${refererHeader ?? "<none>"}`,
    );
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Warn-only en mutaciones admin (CSRF). No bloquea bajo ningún caso.
  checkAdminMutationOrigin(request, path);

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
  matcher: ["/app/:path*", "/admin/:path*", "/api/admin/:path*"],
};
