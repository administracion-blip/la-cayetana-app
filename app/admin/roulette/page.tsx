import Link from "next/link";
import { AdminRouletteOpsClient } from "@/components/admin/AdminRouletteOpsClient";
import {
  getRouletteOpsUserOrRedirect,
  userCanManageRouletteConfig,
} from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Hub de operación de la Ruleta de la Suerte.
 *
 * Vista de **solo lectura** sobre el registro de la jornada (tiradas,
 * premios y rascas), con KPIs y stock. Permite navegar entre días y
 * cambia el día por defecto al ciclo activo (jornada 13:00→12:59).
 *
 * Acceso: `canViewRouletteOps`, `canEditRouletteConfig` o `isAdmin`. La
 * pestaña/enlace a la configuración solo se muestra a quien puede editarla.
 */
export default async function AdminRouletteOpsPage() {
  const user = await getRouletteOpsUserOrRedirect();
  const canEditConfig = userCanManageRouletteConfig(user);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:max-w-none lg:px-6 xl:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Volver a administración
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Ruleta — registro</h1>
          <p className="mt-1 text-sm text-muted">
            Tiradas, premios y rascas por jornada. Vista de solo lectura: las
            mutaciones se hacen desde la app del socio o, en su caso, desde la
            configuración.
          </p>
        </div>
        {canEditConfig ? (
          <Link
            href="/admin/roulette/config"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Configurar ruleta →
          </Link>
        ) : null}
      </div>
      <AdminRouletteOpsClient />
    </div>
  );
}
