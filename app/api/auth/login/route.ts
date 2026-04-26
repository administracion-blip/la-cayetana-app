import { NextResponse } from "next/server";
import { isLoginClosed } from "@/lib/access-gates";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { verifyCaptcha } from "@/lib/security/captcha";
import { getUserByEmail } from "@/lib/repositories/users";
import { loginSchema } from "@/lib/validation";

function wantsJson(contentType: string | null): boolean {
  return !!contentType && contentType.includes("application/json");
}

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Rate-limit del login. Doble capa para resistir tanto el brute-force
 * desde una sola IP como el ataque distribuido contra un único email.
 * Las ventanas son generosas para no penalizar a usuarios honestos que
 * tecleen mal su contraseña varias veces seguidas.
 */
async function enforceLoginRateLimit(ip: string, email: string): Promise<void> {
  await enforceRateLimit({
    key: `auth:login:ip:${ip}`,
    windowMs: 10 * 60 * 1000,
    max: 30,
  });
  await enforceRateLimit({
    key: `auth:login:email:${email.toLowerCase()}`,
    windowMs: 10 * 60 * 1000,
    max: 10,
  });
}

function rateLimitResponse(
  err: RateLimitError,
  asJson: boolean,
  request: Request,
): NextResponse {
  const headers = { "Retry-After": String(err.retryAfterSec) };
  if (asJson) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
      },
      { status: 429, headers },
    );
  }
  const res = redirectTo(request, "/login?error=rate-limited");
  res.headers.set("Retry-After", headers["Retry-After"]);
  return res;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");
  const asJson = wantsJson(contentType);

  try {
    let raw: unknown;
    if (asJson) {
      raw = await request.json();
    } else {
      const form = await request.formData();
      raw = Object.fromEntries(form.entries());
    }

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      if (asJson) {
        return NextResponse.json(
          { error: "Datos no válidos" },
          { status: 400 },
        );
      }
      return redirectTo(request, "/login?error=bad-input");
    }

    const { email, password, rememberMe, captchaToken } = parsed.data;

    try {
      await enforceLoginRateLimit(extractClientIp(request), email);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return rateLimitResponse(err, asJson, request);
      }
      throw err;
    }

    // Captcha (si está configurado en env). Se valida después del rate
    // limit por IP/email para que un atacante no agote cuotas de Turnstile
    // disparando peticiones triviales.
    const captcha = await verifyCaptcha(captchaToken, request);
    if (!captcha.ok) {
      if (asJson) {
        return NextResponse.json({ error: captcha.error }, { status: 400 });
      }
      return redirectTo(request, "/login?error=captcha");
    }

    const user = await getUserByEmail(email);
    if (!user) {
      if (asJson) {
        return NextResponse.json(
          { error: "Email o contraseña incorrectos" },
          { status: 401 },
        );
      }
      return redirectTo(request, "/login?error=invalid");
    }

    const ok = user.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : false;
    if (!ok) {
      if (asJson) {
        return NextResponse.json(
          { error: "Email o contraseña incorrectos" },
          { status: 401 },
        );
      }
      return redirectTo(request, "/login?error=invalid");
    }

    // Login cerrado desde admin: sólo staff/admin puede pasar.
    if (!user.isAdmin && (await isLoginClosed())) {
      const msg = "El inicio de sesión está temporalmente cerrado.";
      if (asJson) {
        return NextResponse.json({ error: msg }, { status: 403 });
      }
      return redirectTo(request, "/login?error=closed");
    }

    if (user.status !== "active") {
      const pendingMsg =
        "Tu cuenta está pendiente de validación de pago. Te avisaremos cuando esté lista.";
      const inactiveMsg = "Tu cuenta no está activa.";
      const isPending = user.status === "pending_payment";
      if (asJson) {
        return NextResponse.json(
          { error: isPending ? pendingMsg : inactiveMsg },
          { status: 403 },
        );
      }
      return redirectTo(
        request,
        isPending ? "/login?error=pending" : "/login?error=inactive",
      );
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
    });
    await setSessionCookie(token, { persistent: rememberMe });

    if (asJson) {
      return NextResponse.json({ ok: true });
    }
    return redirectTo(request, "/app");
  } catch (e) {
    // Solo el mensaje: evita volcar stacks completos con metadatos de la
    // petición (incluyendo posibles parámetros con email/passwordHash) en
    // CloudWatch.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth][login] error: ${msg}`);
    if (asJson) {
      return NextResponse.json(
        { error: "Error al iniciar sesión" },
        { status: 500 },
      );
    }
    return redirectTo(request, "/login?error=server");
  }
}
