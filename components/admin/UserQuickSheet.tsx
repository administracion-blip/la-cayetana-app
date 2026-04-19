"use client";

import type { SafeUser } from "./AdminUsersClient";

type Props = {
  user: SafeUser | null;
  /** Indica si hay una acción en curso sobre este usuario. */
  busy: boolean;
  onClose: () => void;
  onActivate: (user: SafeUser) => void;
  onDelivery: (user: SafeUser, action: "deliver" | "undo") => void;
};

const SEX_LABEL: Record<string, string> = {
  male: "Hombre",
  female: "Mujer",
  prefer_not_to_say: "Prefiero no decirlo",
};

const EUR_FORMAT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

function formatEuros(cents: number | undefined | null): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "—";
  return EUR_FORMAT.format(cents / 100);
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatusBadge({ user }: { user: SafeUser }) {
  if (user.status === "pending_payment") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        Pendiente pago
      </span>
    );
  }
  if (user.status === "inactive") {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
        Inactivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      Activo
    </span>
  );
}

function DeliveryBadge({ user }: { user: SafeUser }) {
  if (user.status !== "active") {
    return <span className="text-sm text-muted">—</span>;
  }
  const delivered = user.deliveryStatus === "delivered";
  return delivered ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      Entregado
      {user.deliveredAt ? (
        <span className="ml-1 font-normal text-emerald-600">
          {formatDate(user.deliveredAt)}
        </span>
      ) : null}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
      Pendiente
    </span>
  );
}

/**
 * Ficha flotante con los datos del socio escaneado y los botones de acción
 * (Activar / Renovar / Marcar entregado / Deshacer entrega), que reutilizan
 * los mismos endpoints que la tabla principal.
 *
 * Se abre tras escanear un QR desde el panel admin y se cierra automáticamente
 * cuando la acción finaliza correctamente.
 */
export function UserQuickSheet({
  user,
  busy,
  onClose,
  onActivate,
  onDelivery,
}: Props) {
  if (!user) return null;

  const currentYear = new Date().getUTCFullYear();
  const paidThisYear =
    user.paidAt && new Date(user.paidAt).getUTCFullYear() === currentYear;
  const delivered = user.deliveryStatus === "delivered";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha de ${user.name}`}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl bg-card shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Socio
            </p>
            <p className="mt-0.5 font-mono text-lg">
              {user.membershipId ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-muted hover:bg-zinc-100 hover:text-foreground"
            aria-label="Cerrar"
          >
            Cerrar
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Nombre
            </dt>
            <dd className="mt-1 text-[15px]">{user.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Email
            </dt>
            <dd className="mt-1 break-all text-[15px]">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Teléfono
            </dt>
            <dd className="mt-1 text-[15px]">{user.phone ?? "—"}</dd>
          </div>
          {user.sex ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                Sexo
              </dt>
              <dd className="mt-1 text-[15px]">
                {SEX_LABEL[user.sex] ?? user.sex}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Estado
            </dt>
            <dd className="mt-1">
              <StatusBadge user={user} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Importe
            </dt>
            <dd className="mt-1 font-mono text-[15px]">
              {formatEuros(user.paidAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Entrega
            </dt>
            <dd className="mt-1">
              <DeliveryBadge user={user} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Alta
            </dt>
            <dd className="mt-1 text-[15px]">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-zinc-50 px-5 py-4">
          {user.status === "pending_payment" || user.status === "inactive" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onActivate(user)}
              className="inline-flex items-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy ? "Activando…" : "Activar"}
            </button>
          ) : null}

          {user.status === "active" && !paidThisYear ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onActivate(user)}
              className="inline-flex items-center rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-60"
            >
              {busy ? "…" : "Renovar"}
            </button>
          ) : null}

          {user.status === "active" ? (
            delivered ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelivery(user, "undo")}
                className="inline-flex items-center rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-60"
              >
                {busy ? "…" : "Deshacer entrega"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelivery(user, "deliver")}
                className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Guardando…" : "Marcar entregado"}
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
