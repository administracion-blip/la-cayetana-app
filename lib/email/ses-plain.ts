import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getEnv } from "@/lib/env";

/** Resultado del intento de envío (solo para logs / lógica servidor). */
export type SesPlainTextEmailResult =
  | { ok: true; mode: "ses" }
  | { ok: false; mode: "log-only"; reason: "missing_from_email" }
  | {
      ok: false;
      mode: "ses";
      reason: "send_failed";
      errorMessage?: string;
    };

export async function sendSesPlainTextEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<SesPlainTextEmailResult> {
  let from: string | undefined;
  try {
    from = getEnv().SES_FROM_EMAIL;
  } catch {
    from = undefined;
  }

  if (!from) {
    console.warn(
      `[email] send skipped: missing_from_email subject="${params.subject}" to=${params.to}`,
    );
    return { ok: false, mode: "log-only", reason: "missing_from_email" };
  }

  const { AWS_REGION } = getEnv();
  const client = new SESClient({ region: AWS_REGION });

  try {
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
    console.log(
      `[email] SES SendEmail succeeded to=${params.to} region=${AWS_REGION}`,
    );
    return { ok: true, mode: "ses" };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(
      `[email] SES SendEmail failed to=${params.to} region=${AWS_REGION}`,
      errorMessage,
    );
    return {
      ok: false,
      mode: "ses",
      reason: "send_failed",
      errorMessage,
    };
  }
}
