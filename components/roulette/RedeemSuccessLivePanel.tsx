"use client";

import { useEffect, useState } from "react";

const redeemedFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const liveFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface RedeemSuccessLivePanelProps {
  /** Encabezado pequeño sobre el nombre del premio (p. ej. "Tu premio"). */
  prizeLineTitle: string;
  prizeLabel: string;
  validatorName: string | null;
  /** Instante en que el servidor confirmó el canje (reloj del dispositivo). */
  redeemedAt: Date;
  onClose: () => void;
  /** Cierre automático en segundos (por defecto 6). */
  autoCloseSeconds?: number;
  /** `id` del título principal para `aria-labelledby` del modal contenedor. */
  titleId?: string;
}

/**
 * Pantalla de éxito tras canjear en taquilla: animación tipo cohetes, marca
 * EN DIRECTO, hora fija del canje y reloj que avanza cada segundo (anti-captura).
 */
export function RedeemSuccessLivePanel({
  prizeLineTitle,
  prizeLabel,
  validatorName,
  redeemedAt,
  onClose,
  autoCloseSeconds = 6,
  titleId,
}: RedeemSuccessLivePanelProps) {
  const [now, setNow] = useState(() => new Date());
  const [secondsLeft, setSecondsLeft] = useState(autoCloseSeconds);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const endAt = Date.now() + autoCloseSeconds * 1000;
    const closeId = window.setTimeout(() => onClose(), autoCloseSeconds * 1000);
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => {
      clearTimeout(closeId);
      clearInterval(id);
    };
  }, [autoCloseSeconds, onClose]);

  return (
    <div className="space-y-4 text-center">
      {/* Franja animada estilo cohetes (no es un .gif estático). */}
      <div className="redeem-rocket-strip" aria-hidden="true">
        <span className="redeem-rocket">🚀</span>
        <span className="redeem-rocket">✨</span>
        <span className="redeem-rocket">🚀</span>
        <span className="redeem-rocket">✨</span>
        <span className="redeem-rocket">🚀</span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span
          className="redeem-live-pill inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-800 shadow-sm"
          title="Señal en vivo: el reloj inferior cambia cada segundo"
        >
          <span className="redeem-live-dot" aria-hidden="true" />
          En directo
        </span>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/15 px-3 py-2 text-left text-xs leading-relaxed text-muted">
        <p>
          <span className="font-semibold text-foreground">Canjeado el</span>{" "}
          {redeemedFmt.format(redeemedAt)}
        </p>
        <p className="mt-1 font-mono text-[13px] text-foreground">
          Ahora (vivo): {liveFmt.format(now)}
        </p>
      </div>

      <div
        className="redeem-ok-check-wrap mx-auto flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-[0_8px_28px_-6px_rgba(16,185,129,0.45)] ring-4 ring-emerald-200/90"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-10 w-10"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path className="redeem-ok-check-path" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/90 to-emerald-50/40 px-4 py-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800/75">
          {prizeLineTitle}
        </p>
        <p className="mt-2 text-pretty text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {prizeLabel}
        </p>
      </div>
      <h2
        id={titleId}
        className="text-base font-semibold text-foreground"
      >
        ¡Canje realizado!
      </h2>
      {validatorName ? (
        <p className="text-xs leading-relaxed text-muted">
          Validado por {validatorName}.
        </p>
      ) : null}
      <p className="text-[11px] text-muted">
        Esta ventana se cerrará sola en {secondsLeft}s…
      </p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
      >
        Cerrar
      </button>
    </div>
  );
}
