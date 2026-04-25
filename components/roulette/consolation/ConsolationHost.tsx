"use client";

import { useCallback, useEffect, useState } from "react";
import { QrScannerModal } from "@/components/admin/QrScannerModal";
import { EnvelopeModal } from "@/components/roulette/consolation/EnvelopeModal";
import { ScratchCard } from "@/components/roulette/consolation/ScratchCard";
import { RedeemSuccessLivePanel } from "@/components/roulette/RedeemSuccessLivePanel";

/**
 * Metadatos del rasca activo. Vienen de `/api/app/roulette/status`
 * (`activeConsolation`) o de `/api/app/roulette/spin` (`consolation`).
 */
export type ActiveConsolationDto = {
  consolationId: string;
  rewardLabel: string;
  awardedAt?: string;
  expiresAt: string;
};

/** Vista interna del flujo de consolación. */
export type ConsolationView =
  | "closed"
  | "envelope"
  | "scratch"
  | "scan"
  | "ok"
  | "expired";

type Props = {
  /**
   * Vista controlada por el host padre. Usamos control externo para que
   * el padre decida cuándo abrir envelope (tras 2ª derrota) o cerrar todo
   * (tras canje o descarte implícito).
   */
  view: ConsolationView;
  onViewChange: (v: ConsolationView) => void;
  /** Rasca activo. Mientras haya `activeConsolation` en backend, viene aquí. */
  consolation: ActiveConsolationDto | null;
  /** Se llama tras un canje OK o una expiración: el padre recarga status. */
  onRefresh: () => Promise<void> | void;
};

/**
 * Orquesta el flujo: envelope → scratch → scan → ok | expired.
 *
 * Sigue el patrón de `RouletteHost` reutilizando `QrScannerModal` tal cual.
 * Toda la validación se hace en el backend a través de
 * `POST /api/app/consolation/redeem` con `{ consolationId, qrText }`.
 */
export function ConsolationHost({
  view,
  onViewChange,
  consolation,
  onRefresh,
}: Props) {
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemOk, setRedeemOk] = useState<{
    label: string;
    validatorName: string | null;
    redeemedAt: number;
  } | null>(null);

  // Aviso nativo del navegador al cerrar pestaña mientras el rasca está vivo.
  // Mismo patrón que el premio de ruleta en `RouletteHost`.
  useEffect(() => {
    if (!consolation) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [consolation]);

  const handleExpired = useCallback(() => {
    onViewChange("expired");
    void onRefresh();
  }, [onViewChange, onRefresh]);

  const handleScan = useCallback(
    async (raw: string) => {
      if (!consolation) return;
      setRedeemBusy(true);
      setRedeemError(null);
      try {
        const res = await fetch("/api/app/consolation/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consolationId: consolation.consolationId,
            qrText: raw,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              rewardLabel?: string;
              validatorName?: string | null;
              error?: string;
            }
          | null;
        if (res.status === 410) {
          // Premio ya no canjeable (caducado o usado). Forzamos expirado.
          onViewChange("expired");
          await onRefresh();
          return;
        }
        if (!res.ok || !data?.ok) {
          setRedeemError(data?.error ?? "No se pudo canjear el premio");
          onViewChange("scan");
          return;
        }
        setRedeemOk({
          label: data.rewardLabel ?? consolation.rewardLabel,
          validatorName: data.validatorName ?? null,
          redeemedAt: Date.now(),
        });
        onViewChange("ok");
        await onRefresh();
      } catch {
        setRedeemError("Error de red al canjear el premio");
        onViewChange("scan");
      } finally {
        setRedeemBusy(false);
      }
    },
    [consolation, onViewChange, onRefresh],
  );

  // No hay rasca activo → nada que pintar.
  if (!consolation && view !== "ok" && view !== "expired") return null;

  return (
    <>
      <EnvelopeModal
        open={view === "envelope"}
        onOpenScratch={() => onViewChange("scratch")}
        onClose={() => onViewChange("closed")}
      />

      {/* Rasca + countdown + botón canjear (aparece al descubrir) */}
      {view === "scratch" && consolation ? (
        <div
          className="fixed inset-0 z-[125] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="consolation-scratch-title"
        >
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <h2 id="consolation-scratch-title" className="sr-only">
              Rasca y descubre tu regalo
            </h2>
            <ScratchCard
              rewardLabel={consolation.rewardLabel}
              expiresAt={consolation.expiresAt}
              onExpired={handleExpired}
              onRequestRedeem={() => {
                setRedeemError(null);
                onViewChange("scan");
              }}
              onClose={() => onViewChange("closed")}
            />
          </div>
        </div>
      ) : null}

      {/* Scanner de QR del validador, reutilizado del flujo de ruleta */}
      <QrScannerModal
        open={view === "scan"}
        onClose={() => {
          if (redeemBusy) return;
          onViewChange(consolation ? "scratch" : "closed");
        }}
        onResult={(raw) => void handleScan(raw)}
        title="Escanea el QR de taquilla"
        hint="Escanea el QR que te muestra en taquilla"
      />

      {/* Error de canje: toast encima del scanner */}
      {view === "scan" && redeemError ? (
        <div
          className="fixed inset-x-0 bottom-4 z-[130] mx-auto w-[92%] max-w-sm rounded-2xl bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
          role="alert"
        >
          {redeemError}
        </div>
      ) : null}

      {/* Canje OK */}
      {view === "ok" ? (
        <div
          className="fixed inset-0 z-[125] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="consolation-ok-title"
          onClick={() => {
            setRedeemOk(null);
            onViewChange("closed");
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {redeemOk ? (
              <RedeemSuccessLivePanel
                prizeLineTitle="Tu regalo"
                prizeLabel={
                  redeemOk.label ?? consolation?.rewardLabel ?? "tu regalo"
                }
                validatorName={redeemOk.validatorName}
                redeemedAt={new Date(redeemOk.redeemedAt)}
                titleId="consolation-ok-title"
                autoCloseSeconds={6}
                onClose={() => {
                  setRedeemOk(null);
                  onViewChange("closed");
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Caducado */}
      {view === "expired" ? (
        <div
          className="fixed inset-0 z-[125] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="consolation-expired-title"
          onClick={() => onViewChange("closed")}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 text-center">
              <h2
                id="consolation-expired-title"
                className="text-lg font-semibold text-foreground"
              >
                Premio caducado
              </h2>
              <p className="text-sm text-muted">
                No ha dado tiempo a canjearlo. ¡Inténtalo en la próxima
                apertura de la ruleta!
              </p>
              <button
                type="button"
                onClick={() => onViewChange("closed")}
                className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
