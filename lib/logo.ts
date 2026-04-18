/**
 * URL del logo para `<img>` / `next/image`.
 *
 * - Sin `NEXT_PUBLIC_LOGO_URL` → `/logo.png` en `public/`.
 * - `s3://bucket/clave` → `/api/logo` (el servidor hace GetObject con IAM; el bucket puede ser privado).
 * - `https://...` → URL directa (el objeto debe ser público o con CDN).
 */

export function getLogoSrc(): string {
  const raw = process.env.NEXT_PUBLIC_LOGO_URL?.trim();
  if (!raw) return "/logo.png";
  if (raw.startsWith("s3://")) return "/api/logo";
  return raw;
}

export function isRemoteLogoSrc(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

/** Logo servido por la API (S3 privado vía IAM). */
export function isProxiedLogoSrc(src: string): boolean {
  return src === "/api/logo" || src.startsWith("/api/logo?");
}
