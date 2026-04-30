import { buildMemberInviteEmailParts } from "@/lib/email/member-invite-templates";
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
  const { subject, text, html } = buildMemberInviteEmailParts({
    inviteUrl: input.inviteUrl,
    inviterName: input.inviterName,
    recipientName: input.recipientName,
  });

  return sendSesPlainTextEmail({
    to: input.toEmail,
    subject,
    body: text,
    htmlBody: html,
  });
}
