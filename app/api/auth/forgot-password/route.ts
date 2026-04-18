import { NextResponse } from "next/server";
import { generateRawResetToken, hashResetToken } from "@/lib/auth/reset-token";
import { sendPasswordResetEmail } from "@/lib/email/password-reset-mail";
import { getEnv } from "@/lib/env";
import { savePasswordResetToken } from "@/lib/repositories/password-reset";
import { getUserByEmail } from "@/lib/repositories/users";
import { normalizeEmail } from "@/lib/constants";
import { forgotPasswordSchema } from "@/lib/validation";

const GENERIC_OK = {
  ok: true,
  message:
    "Si ese email está registrado, recibirás un enlace para restablecer la contraseña.",
};

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = forgotPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email no válido" }, { status: 400 });
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await getUserByEmail(email);

    if (!user || user.status !== "active") {
      return NextResponse.json(GENERIC_OK);
    }

    const rawToken = generateRawResetToken();
    const tokenHash = hashResetToken(rawToken);
    await savePasswordResetToken(tokenHash, user.id);

    const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendPasswordResetEmail(user.email, resetUrl);

    return NextResponse.json(GENERIC_OK);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud" },
      { status: 500 },
    );
  }
}
