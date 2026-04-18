import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getEnv } from "@/lib/env";

/**
 * Envía el enlace de recuperación con SES.
 * Si `SES_FROM_EMAIL` no está definido, solo registra el enlace en consola.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<void> {
  const { SES_FROM_EMAIL } = getEnv();

  if (!SES_FROM_EMAIL) {
    console.warn(
      "[password-reset] SES_FROM_EMAIL no configurado. Enlace para",
      toEmail,
      ":\n",
      resetUrl,
    );
    return;
  }

  const { AWS_REGION } = getEnv();
  const client = new SESClient({ region: AWS_REGION });

  await client.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: {
          Data: "Restablecer contraseña — La Cayetana",
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: [
              "Hola,",
              "",
              "Para elegir una nueva contraseña en tu cuenta de La Cayetana, abre este enlace (válido 1 hora):",
              resetUrl,
              "",
              "Si no has solicitado este correo, ignóralo.",
            ].join("\n"),
          },
        },
      },
    }),
  );
}
