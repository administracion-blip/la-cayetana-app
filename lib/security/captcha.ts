/**
 * Verificación server-side de Cloudflare Turnstile para formularios
 * públicos (registro, login, forgot/reset, alta de reserva, invitaciones).
 *
 * Modo "opt-in" mediante variables de entorno:
 *  - `TURNSTILE_SECRET_KEY` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ambas presentes
 *    → captcha activo: `verifyCaptcha` exige un token válido.
 *  - Cualquiera de las dos vacía → captcha **desactivado** (devuelve `ok`):
 *    útil en dev y en el rollout inicial. Se registra `[security][captcha]
 *    disabled (...)` solo una vez por boot.
 *
 * Política ante fallos del endpoint de Cloudflare: **fail-closed** cuando
 * el captcha está activo. Si Turnstile no responde, devolvemos error en
 * vez de dejar pasar; un atacante que tumbe la verificación no debería
 * poder saltarse el control. Se controla con `failOpen: true` solo si el
 * endpoint quiere asumir el riesgo (no se usa hoy).
 *
 * Uso típico en una API:
 *
 *   const captcha = await verifyCaptcha(token, request);
 *   if (!captcha.ok) {
 *     return NextResponse.json({ error: captcha.error }, { status: 400 });
 *   }
 */

import { getEnv } from "@/lib/env";
import { hashTag } from "@/lib/log/redact";
import { extractClientIp } from "@/lib/security/rate-limit-http";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warnedDisabled = false;

interface CaptchaSuccess {
  ok: true;
  /** `disabled` cuando no hay claves configuradas. */
  mode: "verified" | "disabled";
}

interface CaptchaFailure {
  ok: false;
  /** Mensaje seguro de mostrar al usuario. */
  error: string;
  /** Pista para logs internos: por qué falló. */
  reason:
    | "missing_token"
    | "invalid_token"
    | "network_error"
    | "config_error";
}

export type CaptchaResult = CaptchaSuccess | CaptchaFailure;

interface VerifyOptions {
  /** Si `true` y el endpoint Turnstile no responde, devolvemos `ok: true`. */
  failOpen?: boolean;
}

/** ¿Está el captcha activo según las variables de entorno? */
export function isCaptchaEnabled(): boolean {
  const env = getEnv();
  return !!env.TURNSTILE_SECRET_KEY && !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/** Site key para el cliente. Devuelve `undefined` si el captcha está off. */
export function getCaptchaSiteKey(): string | undefined {
  return getEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/**
 * Verifica un token de Turnstile contra la API de Cloudflare.
 *
 * @param token  Token enviado por el cliente (campo `cf-turnstile-response`).
 * @param request  Petición original; se usa para extraer la IP remota
 *                 y mejorar la verificación de Cloudflare.
 */
export async function verifyCaptcha(
  token: string | undefined | null,
  request: Request,
  opts: VerifyOptions = {},
): Promise<CaptchaResult> {
  const env = getEnv();

  if (!isCaptchaEnabled()) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        "[security][captcha] disabled (set NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY to enable)",
      );
    }
    return { ok: true, mode: "disabled" };
  }

  if (!token || typeof token !== "string") {
    return {
      ok: false,
      reason: "missing_token",
      error: "Verificación anti-bot pendiente. Recarga la página e inténtalo.",
    };
  }

  const ip = extractClientIp(request);

  let res: Response;
  try {
    const body = new URLSearchParams();
    body.set("secret", env.TURNSTILE_SECRET_KEY ?? "");
    body.set("response", token);
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network";
    console.error(
      `[security][captcha] network error ipHash=${hashTag(ip)} msg=${msg}`,
    );
    if (opts.failOpen) {
      return { ok: true, mode: "disabled" };
    }
    return {
      ok: false,
      reason: "network_error",
      error: "No se pudo verificar el captcha. Intenta de nuevo.",
    };
  }

  if (!res.ok) {
    console.error(
      `[security][captcha] turnstile http=${res.status} ipHash=${hashTag(ip)}`,
    );
    if (opts.failOpen) {
      return { ok: true, mode: "disabled" };
    }
    return {
      ok: false,
      reason: "network_error",
      error: "No se pudo verificar el captcha. Intenta de nuevo.",
    };
  }

  type TurnstilePayload = {
    success?: boolean;
    "error-codes"?: string[];
  };

  const payload = (await res.json().catch(() => null)) as TurnstilePayload | null;

  if (!payload || payload.success !== true) {
    const codes = payload?.["error-codes"]?.join(",") ?? "<no-codes>";
    console.warn(
      `[security][captcha] turnstile rejected ipHash=${hashTag(ip)} codes=${codes}`,
    );
    return {
      ok: false,
      reason: "invalid_token",
      error: "Verificación anti-bot fallida. Recarga la página e inténtalo.",
    };
  }

  return { ok: true, mode: "verified" };
}
