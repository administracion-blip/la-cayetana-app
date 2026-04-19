"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` para acciones destructivas (p. ej. deshacer entrega). */
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmación con el estilo del panel admin (sustituye a `window.confirm`).
 */
export function AdminConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const confirmClass =
    confirmVariant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-500"
      : "bg-brand text-white hover:bg-brand-hover";

  return (
    <div
      className="fixed inset-0 z-[52] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
      aria-describedby="admin-confirm-desc"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2
          id="admin-confirm-title"
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <div
          id="admin-confirm-desc"
          className="mt-3 text-[15px] leading-relaxed text-muted"
        >
          {children}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground hover:bg-zinc-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full px-5 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
