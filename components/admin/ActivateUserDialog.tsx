"use client";

import { useState, type ReactNode } from "react";
import type { SafeUser } from "./AdminUsersClient";

type Props = {
  user: SafeUser;
  /** `pending_payment` → "Activar"; `active`/`inactive` → "Renovar". */
  mode: "activate" | "renew";
  onCancel: () => void;
  /** Si el admin deja el campo vacío, se envía `null` (no se guarda importe). */
  onConfirm: (input: { paidAmountEuros: number | null }) => void;
};

/**
 * Diálogo de activación/renovación con un campo para el importe pagado.
 *
 * Sustituye al `AdminConfirmDialog` para el caso de "Activar"/"Renovar"
 * porque, además de confirmar, queremos capturar `paidAmount` en el mismo
 * paso (antes el endpoint `/activate` siempre se llamaba con `{}` y dejaba
 * el importe sin registrar).
 *
 * El valor por defecto es `0,00` para que el admin lo edite a mano: si lo
 * deja vacío, no se envía importe (queda igual que antes); si lo deja en 0
 * se guarda 0 € de forma explícita.
 */
export function ActivateUserDialog({ user, mode, onCancel, onConfirm }: Props) {
  const [paidAmount, setPaidAmount] = useState<string>("0,00");
  const [error, setError] = useState<string | null>(null);

  const isActivate = mode === "activate";
  const title = isActivate ? "Activar socio" : "Renovar";
  const confirmLabel = isActivate ? "Activar" : "Confirmar renovación";

  function handleConfirm() {
    setError(null);
    const trimmed = paidAmount.trim().replace(",", ".");
    let value: number | null;
    if (trimmed === "") {
      value = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Importe pagado no válido");
        return;
      }
      value = Math.round(parsed * 100) / 100;
    }
    onConfirm({ paidAmountEuros: value });
  }

  let description: ReactNode;
  if (isActivate) {
    description = (
      <>
        ¿Confirmas el pago y activas a{" "}
        <strong className="text-foreground">{user.name}</strong>? Se le asignará
        un carnet (CY) y podrá iniciar sesión.
      </>
    );
  } else {
    description = (
      <>
        ¿Confirmas la renovación de{" "}
        <strong className="text-foreground">{user.name}</strong>? Se actualizará
        la fecha de pago de este año.
        {user.paidAt ? (
          <>
            {" "}
            Último pago registrado:{" "}
            <span className="text-foreground">
              {new Date(user.paidAt).toLocaleDateString("es-ES")}
            </span>
            .
          </>
        ) : null}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[52] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-user-title"
      aria-describedby="activate-user-desc"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2
          id="activate-user-title"
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <div
          id="activate-user-desc"
          className="mt-3 text-[15px] leading-relaxed text-muted"
        >
          {description}
        </div>
        <div className="mt-4">
          <label
            htmlFor="activate-paid-amount"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Importe pagado (€)
          </label>
          <input
            id="activate-paid-amount"
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
          <p className="mt-1 text-xs text-muted">
            Déjalo vacío para no registrar importe.
          </p>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
