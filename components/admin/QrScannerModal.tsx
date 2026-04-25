"use client";

import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Si `true` monta el escáner y abre la cámara. */
  open: boolean;
  /** Se invoca cuando el usuario cierra el modal sin escanear. */
  onClose: () => void;
  /**
   * Se invoca al detectar un QR. Recibe el texto crudo del QR.
   * Tras la primera detección el modal pausa el escáner (modo one-shot).
   */
  onResult: (text: string) => void;
  /** Título de la cabecera (p. ej. autorización de deshacer entrega). */
  title?: string;
  /** Texto de ayuda bajo la vista de cámara. */
  hint?: string;
};

/**
 * Vibra corto en dispositivos compatibles. En iOS Safari no hace nada
 * (la API `navigator.vibrate` no está disponible), pero no lanza error.
 */
function triggerVibration(): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(120);
  } catch {
    // ignorar: algunos navegadores bloquean la API sin interacción previa.
  }
}

/**
 * Beep corto sintetizado con WebAudio (no requiere assets). 1000 Hz durante
 * ~90 ms con fade-out suave para que no "chasque".
 */
function triggerBeep(): void {
  if (typeof window === "undefined") return;
  const AudioCtx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    // ignorar: sin permiso de audio o contexto no permitido.
  }
}

/**
 * Detecta el motivo por el que la cámara no va a arrancar ANTES de intentar
 * abrirla. El caso más frecuente en móvil es acceder por `http://<ip-lan>`:
 * navegadores móviles bloquean `getUserMedia` fuera de `HTTPS`/`localhost`.
 */
function preflightCheck(): string | null {
  if (typeof window === "undefined") return null;
  if (typeof navigator === "undefined") return null;
  const host = window.location.hostname;
  const isLocalhost =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!window.isSecureContext && !isLocalhost) {
    return `La cámara solo funciona sobre HTTPS. Abre esta app por https://… (estás accediendo por ${window.location.protocol}//${window.location.host}).`;
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return "Tu navegador no soporta el acceso a la cámara. Prueba con Chrome, Safari o Firefox actualizados.";
  }
  return null;
}

/**
 * Consulta el estado del permiso de cámara. La Permissions API no está
 * soportada en Safari iOS ni en algunos navegadores antiguos; si falla,
 * devolvemos `"unknown"` y tratamos como "pendiente de conceder" (se
 * mostrará el CTA "Permitir cámara" para forzar el gesto de usuario).
 */
type CameraPermission = "granted" | "denied" | "prompt" | "unknown";

async function queryCameraPermission(): Promise<CameraPermission> {
  if (typeof navigator === "undefined") return "unknown";
  const perms = (navigator as Navigator & { permissions?: Permissions })
    .permissions;
  if (!perms || typeof perms.query !== "function") return "unknown";
  try {
    // `camera` no está tipado en todos los `lib.dom.d.ts`, pero sí existe
    // en Chromium/Firefox. `as PermissionName` evita el warning de TS.
    const status = await perms.query({
      name: "camera" as PermissionName,
    });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

/**
 * Intenta obtener un stream mínimo para forzar el diálogo nativo de
 * permiso. Tras resolver, libera el stream inmediatamente para que el
 * componente `Scanner` pueda abrir su propia cámara sin conflictos.
 */
async function requestCameraAccess(): Promise<{
  ok: boolean;
  errorName?: string;
  errorMessage?: string;
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return { ok: false, errorName: "NotSupported" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string } | undefined;
    return {
      ok: false,
      errorName: e?.name ?? "Unknown",
      errorMessage: e?.message,
    };
  }
}

export function QrScannerModal({
  open,
  onClose,
  onResult,
  title = "Escanear QR de socio",
  hint = "Apunta la cámara al QR del carnet del socio",
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [permission, setPermission] = useState<CameraPermission>("unknown");
  /**
   * Blocked "duro": el usuario (o el SO) ha denegado el permiso y el
   * navegador ya no volverá a mostrar el prompt sin pasar por ajustes.
   * Se decide en base a `NotAllowedError` tras pulsar el CTA.
   */
  const [blocked, setBlocked] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const preflight = preflightCheck();
    if (preflight) {
      setError(preflight);
      setPaused(false);
      setPermission("unknown");
      setBlocked(false);
      firedRef.current = false;
      return;
    }
    setError(null);
    setPaused(false);
    setBlocked(false);
    firedRef.current = false;
    // Consulta el permiso y, si ya está concedido, monta el scanner sin
    // pedir nada; en cualquier otro caso, espera al gesto de usuario.
    void queryCameraPermission().then((p) => setPermission(p));
  }, [open]);

  const setErrorFromNative = useCallback(
    (name: string | undefined, message: string | undefined) => {
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Has denegado el permiso de cámara. Actívalo en los ajustes del navegador (candado junto a la URL) y vuelve a intentarlo.",
        );
        setBlocked(true);
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No se ha encontrado ninguna cámara en este dispositivo.");
      } else if (name === "NotReadableError") {
        setError("No se puede acceder a la cámara. ¿Otra app la está usando?");
      } else if (name === "OverconstrainedError") {
        setError(
          "La cámara trasera no cumple las restricciones. Intenta girar el móvil o reiniciar el navegador.",
        );
      } else if (
        name === "SecurityError" ||
        /secure|https|context/i.test(message ?? "")
      ) {
        setError(
          "La cámara solo funciona sobre HTTPS. Abre esta app por una URL https://…",
        );
      } else {
        setError(
          `No se ha podido iniciar la cámara${name ? ` (${name})` : ""}${
            message ? `: ${message}` : "."
          }`,
        );
      }
    },
    [],
  );

  const handleGrantClick = useCallback(async () => {
    if (requesting) return;
    setRequesting(true);
    setError(null);
    const res = await requestCameraAccess();
    setRequesting(false);
    if (res.ok) {
      setPermission("granted");
      setBlocked(false);
      return;
    }
    setPermission("denied");
    setErrorFromNative(res.errorName, res.errorMessage);
  }, [requesting, setErrorFromNative]);

  const handleScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      if (firedRef.current) return;
      const first = codes[0];
      if (!first?.rawValue) return;
      firedRef.current = true;
      setPaused(true);
      triggerVibration();
      triggerBeep();
      onResult(first.rawValue);
    },
    [onResult],
  );

  const handleError = useCallback(
    (err: unknown) => {
      console.error("[QrScannerModal] error cámara", err);
      const e = err as { name?: string; message?: string } | undefined;
      setErrorFromNative(e?.name, e?.message);
    },
    [setErrorFromNative],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Escanear código QR de socio"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
        <h2 className="text-base font-semibold">Escanear QR de socio</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
        >
          Cancelar
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-white">
            <p className="max-w-sm text-[15px] leading-relaxed">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {blocked ? (
                <button
                  type="button"
                  onClick={handleGrantClick}
                  disabled={requesting}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                >
                  {requesting ? "Solicitando…" : "Reintentar"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                Cerrar
              </button>
            </div>
            {blocked ? (
              <p className="max-w-sm text-xs leading-relaxed text-white/70">
                Si sigue sin funcionar, pulsa el candado junto a la URL →
                «Permisos del sitio» → Cámara → «Permitir», y recarga la
                página.
              </p>
            ) : null}
          </div>
        ) : permission !== "granted" ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center text-white">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8"
                aria-hidden="true"
              >
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Activa la cámara</h3>
              <p className="max-w-sm text-[15px] leading-relaxed text-white/80">
                Para escanear el QR necesitamos acceso a la cámara. Pulsa
                «Permitir cámara» y acepta el aviso del navegador.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGrantClick}
              disabled={requesting}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {requesting ? "Solicitando…" : "Permitir cámara"}
            </button>
          </div>
        ) : (
          <Scanner
            onScan={handleScan}
            onError={handleError}
            paused={paused}
            allowMultiple={false}
            scanDelay={400}
            formats={["qr_code"]}
            constraints={{ facingMode: "environment" }}
            components={{ finder: true, torch: true, zoom: false, onOff: false }}
            styles={{
              // La librería aplica por defecto aspectRatio "1/1"; si no lo anulamos,
              // en móvil vertical el recorte + objectFit cover parece un zoom molesto
              // y el marco del finder queda mal posicionado.
              container: {
                width: "100%",
                height: "100%",
                aspectRatio: "unset",
                maxHeight: "100%",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              },
              video: {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                backgroundColor: "#000",
              },
            }}
          />
        )}

        {!error && permission === "granted" ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="rounded-full bg-black/60 px-4 py-2 text-xs text-white shadow">
              {hint}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
