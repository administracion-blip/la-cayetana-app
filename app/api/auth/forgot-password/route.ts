import { NextResponse } from "next/server";
import { generateRawResetToken, hashResetToken } from "@/lib/auth/reset-token";
import { sendPasswordResetEmail } from "@/lib/email/password-reset-mail";
import { getEnv } from "@/lib/env";
import { hashTag, redactEmail } from "@/lib/log/redact";
import { savePasswordResetToken } from "@/lib/repositories/password-reset";
import { getUserByEmail } from "@/lib/repositories/users";
import { normalizeEmail } from "@/lib/constants";
import { forgotPasswordSchema } from "@/lib/validation";

const LOG = "[auth/forgot-password]";

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
      console.info(`${LOG} validation failed (no email detail)`);
      return NextResponse.json({ error: "Email no válido" }, { status: 400 });
    }

    const email = normalizeEmail(parsed.data.email);
    const emailTag = hashTag(email);
    const emailRedacted = redactEmail(email);
    console.info(
      `${LOG} lookup email=${emailRedacted} emailHash=${emailTag}`,
    );

    const user = await getUserByEmail(email);

    if (!user) {
      console.info(
        `${LOG} no user for normalized email=${emailRedacted} emailHash=${emailTag}`,
      );
      return NextResponse.json(GENERIC_OK);
    }

    if (user.status !== "active") {
      console.info(
        `${LOG} user found but not eligible for reset userId=${user.id} status=${user.status} email=${emailRedacted} emailHash=${emailTag}`,
      );
      return NextResponse.json(GENERIC_OK);
    }

    const rawToken = generateRawResetToken();
    const tokenPrefix = `${rawToken.slice(0, 4)}…`;
    console.info(
      `${LOG} reset token generated userId=${user.id} tokenPrefix=${tokenPrefix} tokenLength=${rawToken.length}`,
    );

    const tokenHash = hashResetToken(rawToken);
    await savePasswordResetToken(tokenHash, user.id);
    console.info(
      `${LOG} password reset token persisted userId=${user.id} emailHash=${emailTag}`,
    );

    const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    console.info(
      `${LOG} attempting password reset email delivery userId=${user.id} emailHash=${emailTag}`,
    );

    const sendResult = await sendPasswordResetEmail(user.email, resetUrl);

    if (sendResult.ok && sendResult.mode === "ses") {
      console.info(
        `${LOG} password reset email dispatched via SES userId=${user.id} emailHash=${emailTag}`,
      );
      return NextResponse.json(GENERIC_OK);
    }

    if (
      !sendResult.ok &&
      sendResult.mode === "log-only" &&
      sendResult.reason === "missing_from_email"
    ) {
      console.warn(
        `${LOG} email NOT sent (SES_FROM_EMAIL missing); client still receives generic success userId=${user.id} emailHash=${emailTag}`,
      );
      return NextResponse.json(GENERIC_OK);
    }

    if (
      !sendResult.ok &&
      sendResult.mode === "ses" &&
      sendResult.reason === "send_failed"
    ) {
      console.error(
        `${LOG} SES send failed userId=${user.id} emailHash=${emailTag}`,
        sendResult.errorMessage ?? "",
      );
      return NextResponse.json(
        { error: "No se pudo procesar la solicitud" },
        { status: 500 },
      );
    }

    console.error(`${LOG} unexpected send result`, sendResult);
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud" },
      { status: 500 },
    );
  } catch (e) {
    console.error(`${LOG} unhandled error`, e);
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud" },
      { status: 500 },
    );
  }
}
