/**
 * Envía un correo de prueba vía SES (misma config que la app).
 *
 * Prueba genérica:
 *   node --env-file=.env.local scripts/send-test-email.mjs destino@ejemplo.com
 *
 * Mismo texto que el correo de bienvenida tras activación
 * (`sendWelcomeRegistrationEmail` en lib/email/transactional.ts):
 *   node --env-file=.env.local scripts/send-test-email.mjs welcome destino@ejemplo.com
 *
 * URL del enlace /login (evita localhost si tu .env.local apunta a dev):
 *   … welcome destino@ejemplo.com https://www.lacayetana.net
 *   (o variable WELCOME_EMAIL_BASE_URL; si no, NEXT_PUBLIC_APP_URL)
 *
 * Opcional (solo modo welcome), vía .env.local:
 *   TEST_WELCOME_NAME, TEST_MEMBERSHIP_ID, TEST_WELCOME_PHONE
 */
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

function buildWelcomeBody({ toEmail, name, membershipId, phone, baseUrl }) {
  const loginUrl = `${baseUrl.replace(/\/$/, "")}/login`;
  const lines = [
    `Hola, ${name.trim()},`,
    "",
    "Hemos recibido tu pago y tu cuenta de socio ya está activa. Estos son tus datos:",
    "",
    `Número de socio: ${membershipId}`,
    `Email: ${toEmail}`,
  ];
  if (phone?.trim()) {
    lines.push(`Teléfono: ${phone.trim()}`);
  }
  lines.push(
    "",
    `Accede a tu carnet digital y al feed desde: ${loginUrl}`,
    "",
    "Si no has realizado este pago, contacta con la caseta La Cayetana.",
    "",
    "— La Cayetana · Granada",
  );
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const isWelcome = args[0]?.toLowerCase() === "welcome";
  const to = (isWelcome ? args[1] : args[0])?.trim();
  const welcomeUrlArg = isWelcome ? args[2]?.trim() : undefined;

  if (!to) {
    console.error(
      "Uso:\n" +
        "  node --env-file=.env.local scripts/send-test-email.mjs <email>\n" +
        "  node --env-file=.env.local scripts/send-test-email.mjs welcome <email> [url-base]\n" +
        "    url-base ej.: https://www.lacayetana.net (si omites, usa NEXT_PUBLIC_APP_URL)",
    );
    process.exit(1);
  }

  const from = process.env.SES_FROM_EMAIL?.trim();
  const region = process.env.AWS_REGION?.trim();
  if (!from) {
    console.error("Falta SES_FROM_EMAIL en el entorno (.env.local).");
    process.exit(1);
  }
  if (!region) {
    console.error("Falta AWS_REGION en el entorno (.env.local).");
    process.exit(1);
  }

  let subject;
  let body;
  /** Solo modo welcome: URL completa del enlace login (para el log). */
  let welcomeLoginUrl = "";

  if (isWelcome) {
    const baseUrl =
      welcomeUrlArg ||
      process.env.WELCOME_EMAIL_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!baseUrl) {
      console.error(
        "Modo welcome: indica la URL base del enlace, p. ej.:\n" +
          "  … welcome correo@ejemplo.com https://www.lacayetana.net\n" +
          "o define WELCOME_EMAIL_BASE_URL o NEXT_PUBLIC_APP_URL en .env.local.",
      );
      process.exit(1);
    }
    try {
      new URL(baseUrl);
    } catch {
      console.error(`URL base inválida: ${baseUrl}`);
      process.exit(1);
    }
    const name = process.env.TEST_WELCOME_NAME?.trim() || "Socio de prueba";
    const membershipId =
      process.env.TEST_MEMBERSHIP_ID?.trim() || "CY0999";
    const phone = process.env.TEST_WELCOME_PHONE?.trim() || "";
    subject = "Tu carnet digital — La Cayetana";
    body = buildWelcomeBody({
      toEmail: to,
      name,
      membershipId,
      phone: phone || undefined,
      baseUrl,
    });
    welcomeLoginUrl = `${baseUrl.replace(/\/$/, "")}/login`;
  } else {
    subject = "[Prueba] La Cayetana — correo de prueba";
    body = [
      "Hola,",
      "",
      "Este es un correo de prueba enviado desde el entorno local del proyecto La Cayetana.",
      `Hora (servidor): ${new Date().toISOString()}`,
      "",
      "Si lo recibes, SES y el remitente están bien configurados.",
      "",
      "— Script scripts/send-test-email.mjs",
    ].join("\n");
  }

  const client = new SESClient({ region });
  try {
    await client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: body, Charset: "UTF-8" } },
        },
      }),
    );
    console.log(
      `OK: enviado a ${to} desde ${from} (región ${region})` +
        (isWelcome ? ` [plantilla bienvenida, login: ${welcomeLoginUrl}]` : ""),
    );
  } catch (e) {
    console.error("Error SES:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
