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
        <h1 className="mt-2 text-2xl font-semibold">Fichajes</h1>
        <p className="mt-1 text-sm text-muted">
          Comparación del cuadrante con los fichajes reales por jornada.
        </p>
      </div>

      <ComparisonClient canManage={canManage} />
    </div>
  );
}
