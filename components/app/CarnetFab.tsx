"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCodeIcon } from "@/components/icons/QrCodeIcon";

export function CarnetFab() {
  const pathname = usePathname();
  if (pathname === "/app/card" || pathname?.startsWith("/app/card/")) {
    return null;
  }

  return (
    <Link
      href="/app/card"
      className="fixed bottom-6 left-1/2 z-20 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-[3px] ring-white transition hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      aria-label="Abrir mi carnet"
    >
      <QrCodeIcon className="h-12 w-12" />
    </Link>
  );
}
