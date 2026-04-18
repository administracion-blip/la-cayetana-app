import type { NextConfig } from "next";

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
};

export default nextConfig;
