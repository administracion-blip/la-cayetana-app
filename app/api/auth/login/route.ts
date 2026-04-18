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

    const { email, password } = parsed.data;
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

    const ok = await verifyPassword(password, user.passwordHash);
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
      if (asJson) {
        return NextResponse.json(
          { error: "Tu cuenta no está activa" },
          { status: 403 },
        );
      }
      return redirectTo(request, "/login?error=inactive");
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
    });
    await setSessionCookie(token);

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
