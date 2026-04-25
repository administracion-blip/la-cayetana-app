/**
 * Helpers para no escupir PII (emails, teléfonos…) crudos en logs/
 * CloudWatch. La idea es que un operador pueda correlacionar líneas
 * (mismo `hashTag`) sin recuperar los datos personales originales.
 *
 *  - `redactEmail("foo.bar@example.com")` → `"f***@e***.com"`.
 *  - `hashTag(value, 6)` → primeros 6 hex de un HMAC-SHA256 con pepper
 *    derivado de `SESSION_SECRET`. Es **estable** entre llamadas pero
 *    sólo desambigua entre el conjunto pequeño de usuarios reales; no
 *    revierte a la PII original.
 *
 * Estos helpers son síncronos y no lanzan: el peor caso devuelve
 * `"<redacted>"` para no romper el flujo de logging.
 */

import { createHmac } from "node:crypto";

function pepper(): string {
  const v = process.env.SESSION_SECRET;
  if (typeof v === "string" && v.length >= 32) return v;
  // Si el secreto no está disponible (tests, scripts puntuales…) usamos
  // un valor constante para que `hashTag` siga siendo determinista; los
  // tags resultantes no son útiles para correlacionar pero al menos no
  // crashean ni filtran el original.
  return "lacayetana-log-redact-fallback";
}

/**
 * Devuelve un tag corto y estable para correlacionar líneas de log
 * referidas al mismo `value` sin filtrar el `value` en sí. Por defecto
 * 6 hex (24 bits) suficientes para distinguir entre miles de usuarios
 * sin permitir reverso útil.
 */
export function hashTag(value: string | null | undefined, len = 6): string {
  if (!value) return "anon";
  try {
    const h = createHmac("sha256", pepper())
      .update(String(value))
      .digest("hex");
    return h.slice(0, Math.max(4, Math.min(16, len)));
  } catch {
    return "redacted";
  }
}

/**
 * Versión "humana" de un email: muestra la primera letra del usuario y
 * la primera letra del dominio + TLD.
 *  - `juan.lopez@gmail.com`  → `j***@g***.com`.
 *  - `info@correo.example`   → `i***@c***.example`.
 *  - emails inválidos        → `<invalid-email>`.
 */
export function redactEmail(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "<redacted>";
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) return "<invalid-email>";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot <= 0) return `${local[0]}***@***`;
  const domainHead = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  return `${local[0]}***@${domainHead[0]}***.${tld}`;
}
