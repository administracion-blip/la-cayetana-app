import { AdminReservasShell } from "@/components/admin/reservations/AdminReservasShell";
import {
  getReservationStaffOrRedirect,
  permissionsForUser,
} from "@/lib/auth/reservation-admin";

export const dynamic = "force-dynamic";

export default async function AdminReservationsPage() {
  const user = await getReservationStaffOrRedirect();
  const permissions = permissionsForUser(user);
  return <AdminReservasShell canEditConfig={permissions.canEditConfig} />;
}
