"use client";

import { useCallback, useEffect, useId, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SHARE_TITLE = "La Cayetana Granada";
const SHARE_TEXT = "Acceso a La Cayetana";

/**
 * Panel flotante con pasos para añadir la web a la pantalla de inicio (iOS / Android).
 * Tras «Entendido» intenta la hoja de compartir nativa (Web Share API); si no hay o falla,
 * copia la URL al portapapeles.
 */
export function PinToHomeScreenModal({ open, onClose }: Props) {
  const titleId = useId();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (open) setToast(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const handleEntendido = async () => {
    if (typeof window === "undefined") {
      handleClose();
      return;
    }

    const url = window.location.href;
    const payload: ShareData = {
      title: SHARE_TITLE,
      text: SHARE_TEXT,
      url,
    };

    setBusy(true);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        const can =
          !navigator.canShare || navigator.canShare(payload);
        if (can) {
          try {
            await navigator.share(payload);
            handleClose();
            return;
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
              handleClose();
              return;
            }
            // Otro error: seguir con portapapeles
          }
        }
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setToast("Enlace copiado al portapapeles");
        window.setTimeout(() => setToast(null), 2500);
      }
      handleClose();
    } catch {
      handleClose();
    } finally {
      setBusy(false);
    }
  };

  if (!open && !toast) return null;

  return (
    <>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[70] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-full border border-border bg-foreground px-4 py-2.5 text-center text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={handleClose}
        >
          <div
            className="max-h-[min(90dvh,640px)] w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex max-h-[inherit] flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
                <h2
                  id={titleId}
                  className="pr-10 text-base font-semibold text-foreground sm:text-lg"
                >
                  Añadir al inicio del móvil
                </h2>
                <p className="mt-1 text-xs text-muted sm:text-sm">
                  Así abres La Cayetana como un acceso directo, sin buscar la
                  pestaña en el navegador.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                  <section
                    className="rounded-xl border border-border bg-background/80 p-3 sm:p-4"
                    aria-label="Instrucciones para iPhone e iPad"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      iPhone / iPad (Safari)
                    </h3>
                    <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted sm:text-sm">
                      <li>
                        Pulsa el botón{" "}
                        <span className="font-medium text-foreground">
                          Compartir
                        </span>{" "}
                        (cuadrado con flecha hacia arriba) en la barra inferior.
                      </li>
                      <li>
                        Desplázate y elige{" "}
                        <span className="font-medium text-foreground">
                          Añadir a pantalla de inicio
                        </span>
                        .
                      </li>
                      <li>
                        Revisa el nombre y pulsa{" "}
                        <span className="font-medium text-foreground">
                          Añadir
                        </span>
                        .
                      </li>
                    </ol>
                  </section>
                  <section
                    className="rounded-xl border border-border bg-background/80 p-3 sm:p-4"
                    aria-label="Instrucciones para Android"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      Android (Chrome)
                    </h3>
                    <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted sm:text-sm">
                      <li>
                        Pulsa el menú{" "}
                        <span className="font-medium text-foreground">⋮</span>{" "}
                        (tres puntos) arriba a la derecha.
                      </li>
                      <li>
                        Elige{" "}
                        <span className="font-medium text-foreground">
                          Instalar aplicación
                        </span>{" "}
                        o{" "}
                        <span className="font-medium text-foreground">
                          Añadir a pantalla de inicio
                        </span>
                        .
                      </li>
                      <li>Confirma en el cuadro que aparezca.</li>
                    </ol>
                    <p className="mt-2 text-[11px] leading-snug text-muted">
                      En otros navegadores el menú puede variar; busca una opción
                      similar en Compartir o en el menú del navegador.
                    </p>
                  </section>
                </div>
              </div>
              <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleEntendido()}
                  className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                >
                  {busy ? "Abriendo…" : "Entendido"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
