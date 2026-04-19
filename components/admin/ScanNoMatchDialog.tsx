"use client";

type Props = {
  membershipId: string;
  onDismiss: () => void;
};

/**
 * Diálogo cuando el QR no coincide con ningún socio en la tabla cargada.
 */
export function ScanNoMatchDialog({ membershipId, onDismiss }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="scan-no-match-title"
      aria-describedby="scan-no-match-desc"
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2
          id="scan-no-match-title"
          className="text-lg font-semibold text-foreground"
        >
          No se encontró el socio
        </h2>
        <p
          id="scan-no-match-desc"
          className="mt-3 text-[15px] leading-relaxed text-muted"
        >
          No hay ningún registro en esta tabla con el número de socio{" "}
          <span className="font-mono font-semibold text-foreground">
            {membershipId}
          </span>
          . Comprueba que el carnet sea correcto o que el socio esté en la lista
          (filtros y búsqueda).
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
