import Link from "next/link";
import { ComparisonClient } from "@/components/admin/rrhh/ComparisonClient";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminRrhhFichajesPage() {
  const user = await getAdminRrhhUserOrRedirect();
  const canManage = userCanManageRrhh(user);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin/rrhh"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a RRHH
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Fichajes</h1>
            <p className="mt-1 text-sm text-muted">
              Comparación del cuadrante con los fichajes reales por jornada.
            </p>
          </div>
          {canManage ? (
            <Link
              href="/admin/rrhh/resumen"
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Resumen jornadas
            </Link>
          ) : null}
        </div>
      </div>

      <ComparisonClient canManage={canManage} />
    </div>
  );
}
