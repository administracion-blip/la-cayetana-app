/**
 * Detector de "magic bytes" minimalista para subidas de archivos.
 *
 * El MIME que reporta el navegador (`File.type`) viaja en el formulario
 * y es **falsificable** por cualquier cliente. Esta utilidad compara la
 * cabecera real del binario contra una tabla pequeña de formatos que la
 * app acepta (PDF e imágenes) y devuelve un veredicto.
 *
 * En esta fase usamos `sniffUploadOrWarn` en modo warn-only: si la
 * cabecera no coincide con el MIME declarado, escribimos un
 * `console.warn` con etiquetas anonimizadas para que un operador pueda
 * monitorizar y, en una fase posterior, promocionarlo a rechazo (415).
 *
 * Nota: la implementación es deliberadamente sin dependencias externas
 * para no aumentar el bundle ni el `node_modules` con una librería ESM
 * que arrastre subdependencias. La cobertura es suficiente para los
 * formatos que el resto de la app valida.
 */

import { hashTag } from "@/lib/log/redact";

export type SniffedMime =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | null;

/**
 * Lee los primeros bytes del buffer y devuelve el MIME detectado, o
 * `null` si no reconoce el formato.
 */
export function sniffMime(buffer: Buffer | Uint8Array): SniffedMime {
  if (!buffer || buffer.length < 4) return null;
  const b = buffer;
  // PDF: "%PDF-" (25 50 44 46 2D)
  if (
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d
  ) {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: "GIF87a" o "GIF89a"
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: RIFF (52 49 46 46) + 4 bytes tamaño + "WEBP" (57 45 42 50)
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Resultado del check para los handlers que quieran reaccionar (hoy
 * todos siguen aceptando el archivo: `ok` se ignora salvo para logs).
 */
export interface SniffResult {
  /** `true` si el sniff coincide con el MIME declarado o no aporta info. */
  ok: boolean;
  /** MIME detectado por la cabecera, si lo identifica. */
  sniffed: SniffedMime;
  /** MIME declarado por el cliente. */
  declared: string;
}

/**
 * Sniff + log (modo warn-only). No rechaza el archivo: si hay
 * mismatch, deja un `console.warn` correlable para análisis y devuelve
 * `ok: false` para que el handler pueda decidir qué hacer (hoy: nada).
 *
 * `ctx` se incluye en el log para distinguir el endpoint origen y
 * (opcionalmente) el id de admin **anonimizado** vía `hashTag`.
 */
export function sniffUploadOrWarn(
  buffer: Buffer | Uint8Array,
  declared: string,
  ctx: { endpoint: string; adminUserId?: string; fileName?: string },
): SniffResult {
  const sniffed = sniffMime(buffer);
  const ok = sniffed === null ? true : sniffed === declared;
  if (!ok) {
    console.warn(
      `[upload][sniff-mismatch] endpoint=${ctx.endpoint} declared=${declared} sniffed=${sniffed ?? "unknown"} fileName=${ctx.fileName ?? "<none>"} adminHash=${hashTag(ctx.adminUserId ?? "anon")}`,
    );
  }
  return { ok, sniffed, declared };
}
