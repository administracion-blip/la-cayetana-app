"use client";

import Image from "next/image";
import { useState } from "react";
import { getLogoSrc, isProxiedLogoSrc, isRemoteLogoSrc } from "@/lib/logo";

type Props = {
  /** Altura en px (ancho del recuadro si el logo es remoto: ~2.5× altura). */
  height?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/**
 * Logo de La Cayetana.
 * `NEXT_PUBLIC_LOGO_URL` (S3/CDN) o `/logo.png` en public.
 * Si la URL remota falla (403, CORS, etc.), muestra texto de respaldo.
 */
export function Logo({
  height = 40,
  className,
  priority = false,
  alt = "La Cayetana Granada",
}: Props) {
  const [remoteFailed, setRemoteFailed] = useState(false);
  const src = getLogoSrc();
  const remote = isRemoteLogoSrc(src);
  const proxied = isProxiedLogoSrc(src);

  if ((remote || proxied) && !remoteFailed) {
    const boxW = Math.round(height * 2.5);
    return (
      <div
        className={`relative inline-block max-w-full ${className ?? ""}`}
        style={{ width: boxW, height }}
      >
        {/* img directo: evita el optimizador si S3 devuelve 403 al proxy; onError → fallback */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain object-center"
          loading={priority ? "eager" : "lazy"}
          onError={() => setRemoteFailed(true)}
        />
      </div>
    );
  }

  if ((remote || proxied) && remoteFailed) {
    return (
      <span
        className={`inline-block text-base font-semibold tracking-tight text-foreground ${className ?? ""}`}
      >
        La Cayetana
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={height}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
