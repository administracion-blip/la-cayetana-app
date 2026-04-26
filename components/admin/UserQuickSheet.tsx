"use client";

import type { ReactNode } from "react";
import { PackageCheckIcon } from "@/components/icons/PackageCheckIcon";
import {
  bonoDeliveryBlockMessage,
  bonoDeliveryBlockReason,
  userHasPaidThisYear,
} from "@/lib/membership";
import type { SafeUser } from "./AdminUsersClient";

type Props = {
  user: SafeUser | null;
  /** Indica si hay una acción en curso sobre este usuario. */
  busy: boolean;
  onClose: () => void;
  onActivate: (user: SafeUser) => void;
  onDelivery: (user: SafeUser, action: "deliver" | "undo") => void;
  /** Activar, renovar y entrega (solo administradores completos en el panel Socios). */
  canManageMemberActions?: boolean;
  /** Abre el modal de permisos (admin) y normalmente se cierra la ficha. */
  onOpenPermissions?: (user: SafeUser) => void;
  /**
   * Si es true, el backdrop no recibe punteros (p. ej. con un diálogo de
   * confirmación encima, evita cierres fantasma al confirmar).
   */
  backdropPointerEventsNone?: boolean;
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
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        Pendiente pago
      </span>
    );
  }
  if (user.status === "inactive") {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
        Inactivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      Activo
    </span>
  );
}

function DeliveryBadge({ user }: { user: SafeUser }) {
  if (user.status !== "active") {
    return <span className="text-xs text-muted">—</span>;
  }
  const delivered = user.deliveryStatus === "delivered";
  return delivered ? (
    <span className="inline-flex max-w-full items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      Entregado
      {user.deliveredAt ? (
        <span className="ml-1 shrink-0 font-normal text-emerald-600">
          {formatDate(user.deliveredAt)}
        </span>
      ) : null}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
      Pendiente
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm leading-snug text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Ficha flotante con los datos del socio escaneado y acciones (activar, renovar,
 * entrega). Misma lógica que la tabla del panel admin.
 */
export function UserQuickSheet({
  user,
  busy,
  onClose,
  onActivate,
  onDelivery,
  canManageMemberActions = true,
  onOpenPermissions,
  backdropPointerEventsNone = false,
}: Props) {
  if (!user) return null;

  const paidThisYear = userHasPaidThisYear(user);
  const blockReason = bonoDeliveryBlockReason(user);
  const canDeliver = blockReason === null;
  const delivered = user.deliveryStatus === "delivered";

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3 sm:p-4 ${
        backdropPointerEventsNone ? "pointer-events-none" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha de ${user.name}`}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto flex max-h-[min(90dvh,720px)] w-full max-w-[42rem] flex-col overflow-hidden rounded-2xl bg-card shadow-xl sm:w-[75vw]"
      >
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Socio
              </p>
              <p className="font-mono text-sm leading-tight text-foreground">
                {user.membershipId ?? "—"}
              </p>
              <p className="mt-1 text-base font-semibold leading-snug text-foreground">
                {user.name}
              </p>
              <p className="mt-0.5 break-all text-xs text-muted">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge user={user} />
                <DeliveryBadge user={user} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-zinc-100 hover:text-foreground"
              aria-label="Cerrar"
            >
              Cerrar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {onOpenPermissions ? (
            <div className="mb-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenPermissions(user)}
                className="w-full rounded-xl border border-border bg-white py-2.5 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-50"
              >
                Permisos (admin, validador, reservas…)
              </button>
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
            <Field label="Teléfono">{user.phone ?? "—"}</Field>
            <Field label="Sexo">
              {user.sex ? SEX_LABEL[user.sex] ?? user.sex : "—"}
            </Field>
            <Field label="Año nac.">{user.birthYear ?? "—"}</Field>
            <Field label="Importe">
              <span className="font-mono tabular-nums">
                {formatEuros(user.paidAmount)}
              </span>
            </Field>
            <Field label="Admin">{user.isAdmin ? "Sí" : "—"}</Field>
            <Field label="Alta">{formatDate(user.createdAt)}</Field>
          </dl>
        </div>

        {canManageMemberActions ? (
          <footer className="shrink-0 border-t border-border bg-zinc-50 px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {user.status === "pending_payment" || user.status === "inactive" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onActivate(user)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60 sm:min-h-0 sm:px-5 sm:py-2.5"
                >
                  {busy ? "Activando…" : "Activar"}
                </button>
              ) : null}

              {user.status === "active" && !paidThisYear ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onActivate(user)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-white px-4 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-60 sm:min-h-0 sm:px-5 sm:py-2.5"
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
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-white px-4 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-60 sm:min-h-0 sm:px-5 sm:py-2.5"
                  >
                    {busy ? "…" : "Deshacer entrega"}
                  </button>
                ) : canDeliver ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelivery(user, "deliver")}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 sm:ml-0 sm:w-auto sm:min-w-[12rem]"
                  >
                    {busy ? (
                      "Guardando…"
                    ) : (
                      <>
                        <PackageCheckIcon className="h-5 w-5 shrink-0" />
                        Marcar entregado
                      </>
                    )}
                  </button>
                ) : blockReason ? (
                  <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 sm:w-auto sm:max-w-xs">
                    {bonoDeliveryBlockMessage(blockReason)}
                  </p>
                ) : null
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
