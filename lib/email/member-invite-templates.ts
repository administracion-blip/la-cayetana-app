/**
 * Plantilla HTML + texto para el correo de invitación de socio.
 * Tablas + estilos inline para compatibilidad con clientes de correo.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapa una URL para usarla en el atributo href (comillas dobles). */
function escapeHref(url: string): string {
  return escapeHtml(url);
}

export function buildMemberInviteEmailParts(input: {
  inviteUrl: string;
  inviterName: string;
  recipientName?: string;
}): { subject: string; text: string; html: string } {
  const recipient = input.recipientName?.trim();
  const greetingLine = recipient ? `Hola, ${recipient},` : "Hola,";
  const inviter = input.inviterName.trim();
  const inviteUrl = input.inviteUrl;

  const subject = "Tu invitación de socio — La Cayetana";

  const text = [
    greetingLine,
    "",
    `${inviter} te ha invitado a unirte como socio de La Cayetana.`,
    "",
    "Completa tu alta abriendo este enlace (válido 7 días):",
    inviteUrl,
    "",
    "Si no esperabas esta invitación, ignora el correo.",
    "",
    "— La Cayetana · Granada",
  ].join("\n");

  const safeGreet = recipient !== undefined ? escapeHtml(recipient) : "";
  const safeInviter = escapeHtml(inviter);
  const safeUrlAttr = escapeHref(inviteUrl);
  const greetingHtml =
    recipient !== undefined
      ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#18181b;">
                Hola, <span style="font-weight:600;">${safeGreet}</span>,
              </p>`
      : `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#18181b;">
                Hola,
              </p>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Invitación — La Cayetana</title>
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .wrapper { width: 100% !important; }
      .px { padding-left: 20px !important; padding-right: 20px !important; }
    }
    a.cta:hover { background-color: #b91c1c !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(inviter)} te ha invitado como socio de La Cayetana.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="wrapper" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td class="px" style="padding:32px 28px 8px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              ${greetingHtml}
              <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#3f3f46;">
                <span style="font-weight:600;color:#18181b;">${safeInviter}</span> te ha invitado a unirte como socio de La Cayetana.
              </p>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.55;color:#3f3f46;">
                Completa tu alta en unos minutos. El enlace es válido durante 7 días.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 28px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#dc2626;">
                    <a class="cta" href="${safeUrlAttr}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 32px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Aceptar invitación
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 28px 28px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                Si no esperabas este correo, puedes ignorarlo con tranquilidad.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#fafafa;border-top:1px solid #f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              <p style="margin:0;font-size:13px;line-height:1.4;color:#71717a;text-align:center;">
                La Cayetana · Granada
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
