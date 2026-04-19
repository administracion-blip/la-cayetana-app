"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons/LogoutIcon";

type Props = {
  /**
   * - `link`: estilo discreto (texto subrayado), pensado para barras de navegación.
   * - `primary`: botón grande destacado en rojo (acciones finales).
   * - `compact`: caja roja compacta con icono + texto, pensada para ir
   *   junto a un título de página.
   */
  variant?: "link" | "primary" | "compact";
  className?: string;
};

export function LogoutButton({ variant = "link", className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  let baseClass: string;
  if (variant === "primary") {
    baseClass =
      "inline-flex items-center justify-center rounded-full border border-red-200 bg-white px-6 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-60";
  } else if (variant === "compact") {
    baseClass =
      "inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-60";
  } else {
    baseClass =
      "text-sm text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50";
  }

  const showIcon = variant === "compact" || variant === "primary";

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={className ?? baseClass}
      aria-label="Cerrar sesión"
    >
      {showIcon ? <LogoutIcon className="h-4 w-4" /> : null}
      {loading ? "Cerrando…" : "Salir"}
    </button>
  );
}
