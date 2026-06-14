import type { SesPlainTextEmailResult } from "@/lib/email/ses-plain";
import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";

/**
 * Envía la invitación de alta a un trabajador. El enlace lleva el token en
 * claro; al abrirlo en `/rrhh/alta`, el trabajador completa sus datos
 * (cuenta + ficha laboral) y queda dado de alta.
 */
export async function sendWorkerInviteEmail(input: {
  toEmail: string;
  inviteUrl: string;
  inviterName: string;
  recipientName?: string;
}): Promise<SesPlainTextEmailResult> {
  const hello = input.recipientName?.trim()
    ? `Hola ${input.recipientName.trim()},`
    : "Hola,";
  const subject = "Alta de trabajador · La Cayetana";
  const text = [
    hello,
    "",
    `${input.inviterName} te ha invitado a completar tu alta como trabajador de La Cayetana.`,
    "",
    "Abre este enlace para rellenar tus datos y crear tu acceso:",
    input.inviteUrl,
    "",
    "El enlace caduca en 7 días. Si no esperabas este correo, ignóralo.",
  ].join("\n");
  const html = [
    `<p>${hello}</p>`,
    `<p>${escapeHtml(input.inviterName)} te ha invitado a completar tu alta como trabajador de La Cayetana.</p>`,
    `<p><a href="${input.inviteUrl}">Completar mi alta</a></p>`,
    `<p style="color:#666;font-size:13px">El enlace caduca en 7 días. Si no esperabas este correo, ignóralo.</p>`,
  ].join("\n");

  return sendSesPlainTextEmail({
    to: input.toEmail,
    subject,
    body: text,
    htmlBody: html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
