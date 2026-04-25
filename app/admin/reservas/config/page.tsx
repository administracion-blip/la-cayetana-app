import Link from "next/link";
import { AdminAccessGatesConfig } from "@/components/admin/reservations/AdminAccessGatesConfig";
import { AdminReservationsConfig } from "@/components/admin/reservations/AdminReservationsConfig";
import { AdminReservationsMenusConfig } from "@/components/admin/reservations/AdminReservationsMenusConfig";
import {
  getReservationStaffOrRedirect,
  permissionsForUser,
} from "@/lib/auth/reservation-admin";

export const dynamic = "force-dynamic";

export default async function AdminReservationsConfigPage() {
  const user = await getReservationStaffOrRedirect();
  const permissions = permissionsForUser(user);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin/reservas"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver al tablero
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Configuración de reservas</h1>
        <p className="mt-1 text-sm text-muted">
          Cierres (carnet/reservas/login), slots, señal, menús ofertados e
          instrucciones de transferencia.
        </p>
      </div>
      <div className="space-y-6">
        <AdminAccessGatesConfig canEdit={permissions.canEditConfig} />
        <AdminReservationsConfig canEdit={permissions.canEditConfig} />
        <AdminReservationsMenusConfig canEdit={permissions.canEditConfig} />
      </div>
    </div>
  );
}
