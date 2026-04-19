import type { SesPlainTextEmailResult } from "@/lib/email/ses-plain";
import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";

/**
 * Envía el enlace de recuperación con SES.
 * Si `SES_FROM_EMAIL` no está definido, no hay envío real (ver resultado).
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<SesPlainTextEmailResult> {
  return sendSesPlainTextEmail({
    to: toEmail,
    subject: "Restablecer contraseña — La Cayetana",
    body: [
      "Hola,",
      "",
      "Para elegir una nueva contraseña en tu cuenta de La Cayetana, abre este enlace (válido 1 hora):",
      resetUrl,
      "",
      "Si no has solicitado este correo, ignóralo.",
    ].join("\n"),
  });
}
