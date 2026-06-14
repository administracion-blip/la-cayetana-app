import Link from "next/link";
import { CuadrantesClient } from "@/components/admin/rrhh/CuadrantesClient";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminRrhhCuadrantesPage() {
  const user = await getAdminRrhhUserOrRedirect();
  const canManage = userCanManageRrhh(user);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:max-w-none lg:px-6 xl:px-8">
      <div className="mb-8">
        <Link
          href="/admin/rrhh"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a RRHH
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Cuadrantes</h1>
        <p className="mt-1 text-sm text-muted">
          Planificación de turnos por jornada y trabajador.
        </p>
      </div>

      <CuadrantesClient canManage={canManage} />
    </div>
  );
}
