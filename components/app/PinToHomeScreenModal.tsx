"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SHARE_TITLE = "La Cayetana Granada";
const SHARE_TEXT = "Acceso a La Cayetana";

/**
 * Información sobre el navegador/plataforma del usuario que usamos para
 * decidir qué instrucciones y qué acción principal mostrar en el modal.
 * No se pretende detectar cada combinación posible, solo las que impactan
 * en cómo se añade la web a la pantalla de inicio.
 */
type PinFlow = {
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isStandalone: boolean;
  canShare: boolean;
  /**
   * Reservado para un futuro flujo con `beforeinstallprompt` en Android.
   * Se deja a `false` a propósito: cuando la app sea PWA instalable, aquí
   * escucharemos el evento y habilitaremos `Instalar app`.
   */
  canInstallPrompt: boolean;
};

const EMPTY_FLOW: PinFlow = {
  isIOS: false,
  isAndroid: false,
  isSafari: false,
  isStandalone: false,
  canShare: false,
  canInstallPrompt: false,
};

function detectPinFlow(): PinFlow {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return EMPTY_FLOW;
  }

  const ua = navigator.userAgent || "";

  const isAndroid = /Android/i.test(ua);
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS 13+ se identifica como "MacIntel" con soporte táctil.
    (navigator.platform === "MacIntel" &&
      typeof navigator.maxTouchPoints === "number" &&
      navigator.maxTouchPoints > 1);

  // Safari real (no Chrome iOS, Edge iOS, Firefox iOS, Samsung Internet, etc.)
  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|CriOS|EdgiOS|FxiOS|OPiOS|SamsungBrowser|Android/i.test(ua);

  const matchStandalone =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isStandalone = matchStandalone || iosStandalone;

  const canShare = typeof navigator.share === "function";

  return {
    isIOS,
    isAndroid,
    isSafari,
    isStandalone,
    canShare,
    canInstallPrompt: false,
  };
}

/**
 * Panel flotante con pasos para añadir la web a la pantalla de inicio.
 * La UX y la acción principal se adaptan a la plataforma detectada para
 * reducir la operativa del usuario al mínimo:
 *  - iOS + Safari -> botón «Abrir compartir» que lanza `navigator.share()`.
 *  - iOS + otro navegador (Chrome iOS, Edge iOS…) -> aviso de usar Safari.
 *  - Android -> instrucciones del menú del navegador + «Entendido».
 *  - Ya instalada (standalone) -> solo confirmación, sin flujo de instalación.
 */
export function PinToHomeScreenModal({ open, onClose }: Props) {
  const titleId = useId();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<PinFlow>(EMPTY_FLOW);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    setFlow(detectPinFlow());
    setToast(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const scenario = useMemo<
    "standalone" | "ios-safari" | "ios-other" | "android" | "generic"
  >(() => {
    if (flow.isStandalone) return "standalone";
    if (flow.isIOS && flow.isSafari) return "ios-safari";
    if (flow.isIOS) return "ios-other";
    if (flow.isAndroid) return "android";
    return "generic";
  }, [flow]);

  const primaryLabel =
    scenario === "standalone"
      ? "Cerrar"
      : scenario === "ios-safari"
        ? "Abrir compartir"
        : "Entendido";

  const handlePrimary = async () => {
    if (typeof window === "undefined") {
      handleClose();
      return;
    }

    if (scenario !== "ios-safari") {
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
      if (flow.canShare) {
        const can = !navigator.canShare || navigator.canShare(payload);
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
            // cualquier otro error: pasamos al fallback
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
          className="fixed bottom-6 left-1/2 z-[130] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-full border border-border bg-foreground px-4 py-2.5 text-center text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
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
                  {scenario === "standalone"
                    ? "Ya la tienes en tu pantalla de inicio"
                    : "Añadir al inicio del móvil"}
                </h2>
                <p className="mt-1 text-xs text-muted sm:text-sm">
                  {scenario === "standalone"
                    ? "Estás usando La Cayetana como app instalada en este dispositivo."
                    : "Abre La Cayetana como un acceso directo, sin buscar la pestaña en el navegador."}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                {scenario === "standalone" ? (
                  <div className="rounded-xl border border-border bg-background/80 p-3 text-sm leading-relaxed text-muted sm:p-4">
                    La app ya está añadida a la pantalla de inicio en este
                    dispositivo. Puedes abrirla desde su icono sin pasar por el
                    navegador.
                  </div>
                ) : scenario === "ios-safari" ? (
                  <section
                    className="rounded-xl border border-border bg-background/80 p-3 sm:p-4"
                    aria-label="Instrucciones para iPhone e iPad con Safari"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      iPhone / iPad (Safari)
                    </h3>
                    <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted sm:text-sm">
                      <li>
                        Pulsa{" "}
                        <span className="font-medium text-foreground">
                          Abrir compartir
                        </span>{" "}
                        en el botón inferior.
                      </li>
                      <li>
                        En la hoja de compartir, desplázate y elige{" "}
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
                ) : scenario === "ios-other" ? (
                  <section
                    className="rounded-xl border border-border bg-background/80 p-3 sm:p-4"
                    aria-label="Instrucciones para iPhone e iPad sin Safari"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      iPhone / iPad
                    </h3>
                    <p className="text-xs leading-relaxed text-muted sm:text-sm">
                      En iPhone y iPad, solo Safari permite añadir una web a la
                      pantalla de inicio. Abre esta misma dirección en{" "}
                      <span className="font-medium text-foreground">
                        Safari
                      </span>{" "}
                      y sigue estos pasos:
                    </p>
                    <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted sm:text-sm">
                      <li>
                        Pulsa el botón{" "}
                        <span className="font-medium text-foreground">
                          Compartir
                        </span>{" "}
                        (cuadrado con flecha hacia arriba).
                      </li>
                      <li>
                        Elige{" "}
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
                ) : scenario === "android" ? (
                  <section
                    className="rounded-xl border border-border bg-background/80 p-3 sm:p-4"
                    aria-label="Instrucciones para Android"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      Android (Chrome y similares)
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
                          Añadir a pantalla de inicio
                        </span>{" "}
                        o{" "}
                        <span className="font-medium text-foreground">
                          Instalar aplicación
                        </span>
                        .
                      </li>
                      <li>Confirma en el cuadro que aparezca.</li>
                    </ol>
                    <p className="mt-2 text-[11px] leading-snug text-muted">
                      El texto exacto puede variar según el navegador. En otros
                      como Samsung Internet o Firefox, busca una opción similar
                      dentro de su menú.
                    </p>
                  </section>
                ) : (
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
                          (cuadrado con flecha hacia arriba).
                        </li>
                        <li>
                          Elige{" "}
                          <span className="font-medium text-foreground">
                            Añadir a pantalla de inicio
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
                          <span className="font-medium text-foreground">
                            ⋮
                          </span>{" "}
                          (tres puntos) arriba a la derecha.
                        </li>
                        <li>
                          Elige{" "}
                          <span className="font-medium text-foreground">
                            Añadir a pantalla de inicio
                          </span>{" "}
                          o{" "}
                          <span className="font-medium text-foreground">
                            Instalar aplicación
                          </span>
                          .
                        </li>
                      </ol>
                    </section>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePrimary()}
                  className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                >
                  {busy ? "Abriendo…" : primaryLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
