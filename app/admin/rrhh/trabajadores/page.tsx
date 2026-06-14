import Link from "next/link";
import { WorkersClient } from "@/components/admin/rrhh/WorkersClient";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Listado del personal de RRHH. La carga de datos y el alta por invitación
 * se gestionan en el cliente contra las rutas `/api/admin/rrhh/workers`.
 */
export default async function AdminRrhhWorkersPage() {
  const user = await getAdminRrhhUserOrRedirect();
  const canManage = userCanManageRrhh(user);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 lg:max-w-none lg:px-6 xl:px-8">
      <div className="mb-8">
        <Link
          href="/admin/rrhh"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a RRHH
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Trabajadores</h1>
        <p className="mt-1 text-sm text-muted">
          Personal dado de alta y sus datos de contacto.
        </p>
      </div>

      <WorkersClient canManage={canManage} />
    </div>
  );
}
