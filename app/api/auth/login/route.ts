import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { getUserByEmail } from "@/lib/repositories/users";
import { loginSchema } from "@/lib/validation";

function wantsJson(contentType: string | null): boolean {
  return !!contentType && contentType.includes("application/json");
}

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
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

    const { email, password, rememberMe } = parsed.data;
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
    console.error(e);
    if (asJson) {
      return NextResponse.json(
        { error: "Error al iniciar sesión" },
        { status: 500 },
      );
    }
    return redirectTo(request, "/login?error=server");
  }
}
