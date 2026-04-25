/**
 * Helpers de normalización para email y teléfono. Se usan tanto para
 * indexar por email (GSI4 `by-email`) como para persistir datos de
 * contacto consistentes en las reservas.
 *
 * Las reglas son intencionadamente simples y deterministas: NO hacemos
 * parsing fino (eso requiere `libphonenumber-js`, que no queremos añadir
 * ahora). Priorizamos idempotencia y bajo riesgo de falsos negativos al
 * comparar.
 */

/** Regex básica de email. Validación estricta vive en Zod. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Devuelve el email en minúsculas y sin espacios iniciales/finales. Ideal
 * para usar como clave de `EMAIL#...` en DynamoDB. No hace `email`-safe
 * encoding: el resultado es seguro dentro de un PK porque no incluye ni
 * `#` ni caracteres reservados.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Valida que `raw` tenga forma de email aceptable (sin TLD exótico). */
export function isLikelyEmail(raw: string): boolean {
  const v = raw.trim();
  if (v.length === 0 || v.length > 254) return false;
  return EMAIL_RE.test(v);
}

/**
 * Normaliza un teléfono a un string "consistente" para guardar y comparar:
 *  - Quita espacios, guiones, paréntesis y puntos intermedios.
 *  - Mantiene el prefijo `+` si existe.
 *  - Si empieza por `00`, lo convierte a `+` (`0034...` → `+34...`).
 *  - Si parece un número español de 9 dígitos (empieza por 6, 7, 8, 9) sin
 *    prefijo, se le añade `+34` por defecto. Esto es opinado — si el
 *    cliente mete otro país conservamos lo que escribió.
 *
 * No verifica que el número sea llamable; eso es responsabilidad del
 * staff. Lo importante es que `normalizePhone("  +34 600 11 22 33 ")` y
 * `normalizePhone("0034-600-11-22-33")` devuelvan la misma cadena.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const cleaned = trimmed
    .replace(/[\s\-().]/g, "")
    .replace(/^00/, "+");
  if (/^\+/.test(cleaned)) return cleaned;
  if (/^[6789]\d{8}$/.test(cleaned)) return `+34${cleaned}`;
  return cleaned;
}

/** Valida que `raw`, tras normalizar, tenga pinta de teléfono plausible. */
export function isLikelyPhone(raw: string): boolean {
  const p = normalizePhone(raw);
  if (!p) return false;
  // Entre 7 y 15 dígitos contando el prefijo (E.164 max = 15).
  return /^\+?\d{7,15}$/.test(p);
}

/**
 * Normaliza un nombre visible: recorta, colapsa espacios intermedios y
 * capitaliza la primera letra de cada palabra. Se usa al persistir el
 * snapshot en la reserva para que "juan  CASTRO " y "Juan Castro"
 * aparezcan iguales en el tablero.
 */
export function normalizeDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((w) =>
      w.length === 0
        ? w
        : w[0].toLocaleUpperCase("es-ES") +
          w.slice(1).toLocaleLowerCase("es-ES"),
    )
    .join(" ");
}
