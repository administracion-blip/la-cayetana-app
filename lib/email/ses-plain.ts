import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getEnv } from "@/lib/env";

/** Devuelve true si el correo se envió por SES; false si no hay remitente (solo log). */
export async function sendSesPlainTextEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<boolean> {
  let from: string | undefined;
  try {
    from = getEnv().SES_FROM_EMAIL;
  } catch {
    from = undefined;
  }

  if (!from) {
    console.warn(
      "[email] SES_FROM_EMAIL no configurado. Asunto:",
      params.subject,
      "→",
      params.to,
    );
    return false;
  }

  const { AWS_REGION } = getEnv();
  const client = new SESClient({ region: AWS_REGION });

  await client.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: { Text: { Data: params.body, Charset: "UTF-8" } },
      },
    }),
  );
  return true;
}
