"use client";

type Props = {
  onDismiss: () => void;
};

/**
 * Aviso cuando el QR escaneado no corresponde a un usuario con permiso admin.
 */
export function AdminAuthDeniedDialog({ onDismiss }: Props) {
  return (
    <div
      className="fixed inset-0 z-[53] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="admin-auth-denied-title"
      aria-describedby="admin-auth-denied-desc"
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2
          id="admin-auth-denied-title"
          className="text-lg font-semibold text-foreground"
        >
          Autorización requerida
        </h2>
        <p
          id="admin-auth-denied-desc"
          className="mt-3 text-[15px] leading-relaxed text-muted"
        >
          No dispones de la autorización necesaria para esta acción.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
