import type { SesPlainTextEmailResult } from "@/lib/email/ses-plain";
import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";

/**
 * Envía la invitación de alta a un nuevo socio.
 *
 * El enlace lleva el token en claro; al abrirlo en `/invitacion`, el
 * destinatario rellena los datos restantes (contraseña, sexo, año de
 * nacimiento, etc.) y la cuenta queda `active` sin pasar por Stripe.
 */
export async function sendMemberInviteEmail(input: {
  toEmail: string;
  inviteUrl: string;
  inviterName: string;
  recipientName?: string;
}): Promise<SesPlainTextEmailResult> {
  const greeting = input.recipientName?.trim()
    ? `Hola, ${input.recipientName.trim()},`
    : "Hola,";
  const body = [
    greeting,
    "",
    `${input.inviterName} te ha invitado a unirte como socio de La Cayetana.`,
    "",
    "Completa tu alta abriendo este enlace (válido 7 días):",
    input.inviteUrl,
    "",
    "Si no esperabas esta invitación, ignora el correo.",
    "",
    "— La Cayetana · Granada",
  ].join("\n");

  return sendSesPlainTextEmail({
    to: input.toEmail,
    subject: "Tu invitación de socio — La Cayetana",
    body,
  });
}
