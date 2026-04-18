import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";

/**
 * Envía el enlace de recuperación con SES.
 * Si `SES_FROM_EMAIL` no está definido, `sendSesPlainTextEmail` solo registra en consola.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<void> {
  await sendSesPlainTextEmail({
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
