import Link from "next/link";
import { AdminRouletteConfigClient } from "@/components/admin/AdminRouletteConfigClient";
import { getRouletteAdminUserOrRedirect } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Configuración global de la Ruleta (temporada, horarios, stock, tasas y
 * consolación). Requiere `canEditRouletteConfig` (o `isAdmin` legacy).
 * El registro de operación vive en `/admin/roulette` y solo necesita
 * `canViewRouletteOps`.
 */
export default async function AdminRouletteConfigPage() {
  await getRouletteAdminUserOrRedirect();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:max-w-none lg:px-6 xl:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/roulette"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Volver al registro
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Ruleta — configuración</h1>
          <p className="mt-1 text-sm text-muted">
            Temporada (rango de fechas), horarios del ciclo diario, stock,
            probabilidades y opciones de consolación. Los cambios aplican de
            inmediato en la app.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-muted hover:text-foreground"
        >
          Volver a administración
        </Link>
      </div>
      <AdminRouletteConfigClient />
    </div>
  );
}
