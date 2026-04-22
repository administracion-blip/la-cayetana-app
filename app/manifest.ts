import type { MetadataRoute } from "next";

/** Requiere en `public/`: `icon-192.png`, `icon-512.png` (y `icon-180.png` vía metadata.apple en layout). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Cayetana — Carnet digital",
    short_name: "La Cayetana",
    description: "Carnet de socio para la caseta de feria en Granada",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#d12f2f",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
