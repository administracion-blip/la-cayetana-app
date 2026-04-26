import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { hashResetToken } from "@/lib/auth/reset-token";
import { verifyCaptcha } from "@/lib/security/captcha";
import {
  applyRateLimits,
  extractClientIp,
} from "@/lib/security/rate-limit-http";
import {
  deletePasswordReset,
  getPasswordReset,
  isPasswordResetExpired,
} from "@/lib/repositories/password-reset";
import { getUserById, updatePasswordHashByUserId } from "@/lib/repositories/users";
import { resetPasswordSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    // RL por IP: 20 cambios cada 10 min. Frena fuerza bruta sobre tokens
    // (aunque el token tiene 64 hex de entropía, no cuesta nada limitarlo).
    const ip = extractClientIp(request);
    const ipLimit = await applyRateLimits(
      request,
      [
        {
          key: `auth:reset:ip:${ip}`,
          windowMs: 10 * 60 * 1000,
          max: 20,
        },
      ],
      { route: "auth/reset-password" },
    );
    if (!ipLimit.ok) return ipLimit.response;

    const raw = await request.json();
    const parsed = resetPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos no válidos (contraseña mín. 8 caracteres)" },
        { status: 400 },
      );
    }

    const { token, password, captchaToken } = parsed.data;

    const captcha = await verifyCaptcha(captchaToken, request);
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 });
    }

    const tokenHash = hashResetToken(token);

    // Segundo freno: 5 intentos por token cada 10 min. Si alguien encuentra
    // un token (logs, captura) que no es suyo, no puede usarlo para
    // ensayar contraseñas distintas indefinidamente.
    const tokenLimit = await applyRateLimits(
      request,
      [
        {
          key: `auth:reset:token:${tokenHash}`,
          windowMs: 10 * 60 * 1000,
          max: 5,
        },
      ],
      { route: "auth/reset-password" },
    );
    if (!tokenLimit.ok) return tokenLimit.response;

    const record = await getPasswordReset(tokenHash);

    if (!record || isPasswordResetExpired(record)) {
      return NextResponse.json(
        { error: "El enlace ha caducado o no es válido. Solicita uno nuevo." },
        { status: 400 },
      );
    }

    const user = await getUserById(record.userId);
    if (!user || user.status !== "active") {
      await deletePasswordReset(tokenHash);
      return NextResponse.json(
        { error: "No se puede restablecer la contraseña para esta cuenta." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    await updatePasswordHashByUserId(user.id, passwordHash);
    await deletePasswordReset(tokenHash);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo cambiar la contraseña" },
      { status: 500 },
    );
  }
}
