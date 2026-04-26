import Link from "next/link";
import { AdminReservationDetail } from "@/components/admin/reservations/AdminReservationDetail";
import { getReservationStaffOrRedirect } from "@/lib/auth/reservation-admin";

export const dynamic = "force-dynamic";

export default async function AdminReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getReservationStaffOrRedirect();
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:py-6 lg:max-w-none lg:px-6 xl:px-8">
      <div className="mb-4">
        <Link
          href="/admin/reservas"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver al tablero
        </Link>
      </div>
      <AdminReservationDetail reservationId={id} />
    </div>
  );
}
