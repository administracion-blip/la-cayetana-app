import type { NextConfig } from "next";

/**
 * CSP en modo Report-Only durante la fase de hardening: el navegador
 * registra violaciones en la consola pero no bloquea recursos. Cuando
 * tengamos varias semanas de logs limpios, se promociona a la cabecera
 * `Content-Security-Policy` real (eliminando el sufijo `-Report-Only`).
 *
 * Notas:
 *  - `script-src` permite `'unsafe-inline'` y `'unsafe-eval'` porque Next
 *    16 + react-compiler emiten algún script inline en hidratación. Se
 *    endurecerá con `nonce` en una fase posterior.
 *  - `img-src` lista los buckets S3 ya autorizados en `images.remotePatterns`.
 *  - `frame-ancestors 'none'` actúa como X-Frame-Options moderno.
 */
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://imgbucketimg.s3.eu-west-3.amazonaws.com https://imgs-publico.s3.eu-west-3.amazonaws.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "form-action 'self' https://buy.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Permite cargar /_next/* desde la LAN en desarrollo (móvil u otras máquinas).
  // Usa comodines para no tener que actualizar si cambia la IP del PC.
  allowedDevOrigins: ["192.168.1.*", "10.0.0.*", "*.local"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "imgbucketimg.s3.eu-west-3.amazonaws.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "imgs-publico.s3.eu-west-3.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
