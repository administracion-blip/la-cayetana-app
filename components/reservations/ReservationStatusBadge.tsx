import type { ReservationStatus } from "@/types/models";

const LABELS: Record<ReservationStatus, string> = {
  pending: "Pendiente de revisar",
  awaiting_customer: "Esperando tu confirmación",
  awaiting_prepayment: "Pendiente de señal",
  confirmed: "Confirmada",
  cancelled_by_customer: "Cancelada por ti",
  cancelled_by_staff: "Cancelada por La Cayetana",
  no_show: "No presentada",
  completed: "Atendida",
};

const CLASSES: Record<ReservationStatus, string> = {
  pending: "bg-amber-50 text-amber-900 border-amber-200",
  awaiting_customer: "bg-blue-50 text-blue-900 border-blue-200",
  awaiting_prepayment: "bg-orange-50 text-orange-900 border-orange-200",
  confirmed: "bg-emerald-50 text-emerald-900 border-emerald-200",
  cancelled_by_customer: "bg-muted text-muted-foreground border-border",
  cancelled_by_staff: "bg-rose-50 text-rose-900 border-rose-200",
  no_show: "bg-rose-50 text-rose-900 border-rose-200",
  completed: "bg-muted text-muted-foreground border-border",
};

export function ReservationStatusBadge({
  status,
}: {
  status: ReservationStatus;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${CLASSES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}

export function reservationStatusLabel(status: ReservationStatus): string {
  return LABELS[status];
}
