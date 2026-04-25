import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Debe coincidir con `COOKIE` en lib/auth/session.ts */
const SESSION_COOKIE = "lc_session";

/** Debe coincidir con `GUEST_COOKIE_NAME` en lib/auth/guest-cookie.ts */
const GUEST_COOKIE = "lc_guest_session";
/** Debe coincidir con `GUEST_TOKEN_ISSUER` en lib/auth/reservations.ts */
const GUEST_TOKEN_ISSUER = "lacayetana.reservations.guest";

/** Métodos que mutan estado: aplican al check Origin/Referer warn-only. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Si la URL trae un magic-link `?gt=<JWT>` válido, lo movemos a una
 * cookie httpOnly y redirigimos a la URL limpia. Esto hace que el token
 * deje de vivir en `localStorage` y no quede expuesto a JS / extensiones
 * / historial del navegador.
 *
 * - Sólo aplica a peticiones GET (las navegaciones desde el correo).
 * - Sólo se hace verificación de firma + issuer; la verificación contra
 *   `sessionVersion` se sigue haciendo en cada endpoint que use el token
 *   (allí sí tenemos acceso a DynamoDB; el middleware corre en Edge).
 * - Si la firma falla simplemente dejamos pasar la petición: la página
 *   renderizará el landing y el cliente actual limpia el `?gt=` del URL.
 *
 * Controlado con la flag `GUEST_COOKIE_ENABLED`. Si no está activa la
 * petición se deja seguir intacta (el cliente legacy procesa el `?gt=`).
 */
async function consumeMagicLinkIfPresent(
  request: NextRequest,
  path: string,
): Promise<NextResponse | null> {
  if (process.env.GUEST_COOKIE_ENABLED !== "true") return null;
  if (request.method !== "GET") return null;
  if (path !== "/reservas" && !path.startsWith("/reservas/")) return null;

  const gt = request.nextUrl.searchParams.get("gt");
  if (!gt) return null;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;

  try {
    const { payload } = await jwtVerify(gt, new TextEncoder().encode(secret), {
      issuer: GUEST_TOKEN_ISSUER,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
  } catch {
    // Firma inválida o caducada → seguimos sin tocar nada.
    return null;
  }

  const cleanUrl = request.nextUrl.clone();
  cleanUrl.searchParams.delete("gt");
  const response = NextResponse.redirect(cleanUrl);
  response.cookies.set(GUEST_COOKIE, gt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

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

  // PR-3.1: si llega un magic-link `?gt=...` válido, lo movemos a cookie
  // httpOnly y redirigimos a la URL limpia.
  const consumed = await consumeMagicLinkIfPresent(request, path);
  if (consumed) return consumed;

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
  matcher: [
    "/app/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    // Cubre `/reservas` y `/reservas/<id>` para consumir `?gt=` server-side.
    "/reservas",
    "/reservas/:path*",
  ],
};
