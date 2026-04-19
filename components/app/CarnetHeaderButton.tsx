"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCodeIcon } from "@/components/icons/QrCodeIcon";

/**
 * Acceso rápido al carnet desde la cabecera de `/app`. Cuadrado con bordes
 * redondeados, rojo oscuro, pensado para estar junto a la navegación.
 */
export function CarnetHeaderButton() {
  const pathname = usePathname();
  const onCard =
    pathname === "/app/card" || pathname?.startsWith("/app/card/");
  if (onCard) return null;

  return (
    <Link
      href="/app/card"
      aria-label="Abrir mi carnet"
      title="Abrir mi carnet"
      className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-700 text-white shadow-sm transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
    >
      <QrCodeIcon className="h-8 w-8" />
    </Link>
  );
}
