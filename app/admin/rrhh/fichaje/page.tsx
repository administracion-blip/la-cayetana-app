import Link from "next/link";
import { redirect } from "next/navigation";
import { TerminalClient } from "@/components/admin/rrhh/TerminalClient";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Terminal de fichaje: muestra un QR dinámico que los trabajadores escanean
 * con su móvil (sesión iniciada) para fichar. Solo gestores de RRHH lo abren.
 */
export default async function AdminRrhhTerminalPage() {
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
        <h1 className="mt-2 text-2xl font-semibold">Terminal de fichaje</h1>
        <p className="mt-1 text-sm text-muted">
          El trabajador escanea este código con su móvil (con sesión iniciada)
          para fichar entrada o salida. El QR cambia cada pocos segundos.
        </p>
      </div>

      <TerminalClient />
    </div>
  );
}
