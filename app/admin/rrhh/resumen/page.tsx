import { redirect } from "next/navigation";
import Link from "next/link";
import { PayrollSummaryClient } from "@/components/admin/rrhh/PayrollSummaryClient";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminRrhhResumenPage() {
  const user = await getAdminRrhhUserOrRedirect();
  // DNI/IBAN son datos sensibles: solo gestión de RRHH.
  if (!userCanManageRrhh(user)) {
    redirect("/admin/rrhh/fichajes");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin/rrhh/fichajes"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a Fichajes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Resumen de jornadas</h1>
        <p className="mt-1 text-sm text-muted">
          Horas fichadas por trabajador y día en el rango seleccionado, con los
          datos para nómina.
        </p>
      </div>

      <PayrollSummaryClient />
    </div>
  );
}
