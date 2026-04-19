import { getEnv } from "@/lib/env";
import { sendSesPlainTextEmail } from "@/lib/email/ses-plain";

function appBaseUrl(): string {
  return getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

/**
 * Correo de bienvenida tras activarse la cuenta (pago confirmado).
 * Contiene número de socio y enlace al login.
 */
export async function sendWelcomeRegistrationEmail(input: {
  toEmail: string;
  name: string;
  membershipId: string;
  phone?: string;
}): Promise<boolean> {
  const loginUrl = `${appBaseUrl()}/login`;

  const lines = [
    `Hola, ${input.name.trim()},`,
    "",
    "Hemos recibido tu pago y tu cuenta de socio ya está activa. Estos son tus datos:",
    "",
    `Número de socio: ${input.membershipId}`,
    `Email: ${input.toEmail}`,
  ];
  if (input.phone?.trim()) {
    lines.push(`Teléfono: ${input.phone.trim()}`);
  }
  lines.push(
    "",
    `Accede a tu carnet digital y al feed desde: ${loginUrl}`,
    "",
    "Si no has realizado este pago, contacta con la caseta La Cayetana.",
    "",
    "— La Cayetana · Granada",
  );

  const result = await sendSesPlainTextEmail({
    to: input.toEmail,
    subject: "Tu carnet digital — La Cayetana",
    body: lines.join("\n"),
  });
  return result.ok;
}
