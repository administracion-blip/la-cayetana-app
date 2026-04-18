"use client";

import { QRCodeSVG } from "qrcode.react";

type Props = {
  value: string;
  /** Tamaño en px del código (por defecto más compacto para carnet en una sola vista). */
  size?: number;
  className?: string;
};

export function MembershipQr({ value, size = 230, className }: Props) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="H"
      includeMargin
      className={className ?? "mx-auto h-auto w-full max-w-[230px]"}
    />
  );
}
