import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfigClient } from "@/components/admin/rrhh/ConfigClient";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminRrhhConfigPage() {
  const user = await getAdminRrhhUserOrRedirect();
  if (!userCanManageRrhh(user)) redirect("/admin/rrhh");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin/rrhh"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a RRHH
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Configuración</h1>
        <p className="mt-1 text-sm text-muted">
          Parámetros del módulo de RRHH: cómo se interpreta la jornada y el
          margen para validar los fichajes.
        </p>
      </div>

      <ConfigClient />
    </div>
  );
}
