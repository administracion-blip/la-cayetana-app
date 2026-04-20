"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QrScannerModal } from "@/components/admin/QrScannerModal";
import type { PrizeType } from "@/types/models";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

type RouletteStatusDto = {
  cycleId: string;
  spinsRemaining: number | null;
  spinsPerCycle: number;
  disabled: boolean;
  shadow: boolean;
  activePrize: {
    prizeId: string;
    prizeType: PrizeType;
    prizeLabel: string;
    awardedAt: string;
    expiresAt: string;
    shadow: boolean;
  } | null;
};

type SpinResultDto = {
  outcome: "win" | "lose";
  prizeType: PrizeType | null;
  prizeLabel: string | null;
  prizeId: string | null;
  expiresAt: string | null;
  spinsRemaining: number | null;
  shadow: boolean;
};

/* ------------------------------------------------------------------ */
/* Configuración visual de la ruleta                                   */
/* ------------------------------------------------------------------ */

type WheelSlot =
  | { kind: "prize"; prizeType: PrizeType; label: string; color: string }
  | { kind: "lose"; label: string; color: string };

/**
 * 8 sectores en sentido horario empezando por arriba. El orden se mezcla
 * para que al perder se pueda caer en uno de los 3 sectores "lose" y
 * quede natural. Los colores son pasteles del esquema amber/rosa del club.
 */
const WHEEL_SLOTS: WheelSlot[] = [
  { kind: "prize", prizeType: "copa", label: "Copa", color: "#fda4af" },
  { kind: "lose", label: "Sigue", color: "#ffe4e6" },
  { kind: "prize", prizeType: "tercio", label: "Tercio", color: "#fca5a5" },
  { kind: "lose", label: "Suerte", color: "#fee2e2" },
  { kind: "prize", prizeType: "chupito", label: "Chupitos", color: "#fecaca" },
  { kind: "prize", prizeType: "rebujito", label: "Rebujito", color: "#fb7185" },
  { kind: "lose", label: "Vuelve", color: "#fff1f2" },
  { kind: "prize", prizeType: "botella", label: "Botella", color: "#f87171" },
];

const SLOT_COUNT = WHEEL_SLOTS.length;
const SLOT_DEG = 360 / SLOT_COUNT;

/** Icono simple de ruleta (no hay dependencia externa). */
function RouletteIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Botón del feed                                                      */
/* ------------------------------------------------------------------ */

function CounterLabel({ status }: { status: RouletteStatusDto | null }) {
  if (!status) return <span className="font-semibold">…</span>;
  if (status.spinsRemaining === null) {
    return <span className="font-semibold">∞</span>;
  }
  return (
    <span className="font-semibold">
      {status.spinsRemaining}/{status.spinsPerCycle}
    </span>
  );
}

function RouletteButton({
  status,
  onClick,
}: {
  status: RouletteStatusDto | null;
  onClick: () => void;
}) {
  const disabled = !status || status.disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
        disabled
          ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
          : "border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-200/80 active:scale-[0.99]"
      }`}
      aria-label="Juega a la Ruleta"
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          disabled ? "bg-zinc-200" : "bg-amber-300"
        }`}
      >
        <RouletteIcon
          className={`h-6 w-6 ${
            disabled ? "text-zinc-500" : "text-amber-900"
          } ${!disabled ? "transition-transform group-hover:rotate-45" : ""}`}
        />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-tight">
          {status?.activePrize
            ? "Ruleta de la Suerte"
            : "Juega a la Ruleta"}
        </span>
        <span className="text-xs leading-tight opacity-80">
          {status?.activePrize
            ? "¡Tienes un premio sin canjear! Pulsa para canjearlo."
            : disabled
              ? "Has gastado tus tiradas. Vuelve tras la próxima apertura."
              : "Prueba suerte y gana premios en La Cayetana."}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-sm ${
          disabled ? "bg-zinc-200" : "bg-white/60"
        }`}
      >
        <CounterLabel status={status} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Modal envolvente                                                    */
/* ------------------------------------------------------------------ */

function Modal({
  open,
  onClose,
  children,
  labelledBy,
  allowClose = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  allowClose?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && allowClose) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, allowClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={() => {
        if (allowClose) onClose();
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ruleta animada                                                      */
/* ------------------------------------------------------------------ */

/**
 * Índice del sector donde debe pararse la ruleta para representar `result`.
 * - Si gana, buscamos el sector del `prizeType` ganador.
 * - Si pierde, elegimos uno de los sectores `lose` al azar (solo visual).
 */
function pickTargetSlotIndex(result: SpinResultDto): number {
  if (result.outcome === "win" && result.prizeType) {
    const idx = WHEEL_SLOTS.findIndex(
      (s) => s.kind === "prize" && s.prizeType === result.prizeType,
    );
    if (idx >= 0) return idx;
  }
  const loseIdxs = WHEEL_SLOTS.map((s, i) => (s.kind === "lose" ? i : -1)).filter(
    (i) => i >= 0,
  );
  return loseIdxs[Math.floor(Math.random() * loseIdxs.length)] ?? 0;
}

/**
 * Dibuja un sector circular como `path` SVG entre dos ángulos (en grados,
 * 0 = arriba, sentido horario). Radio fijo de 100.
 */
function slotPath(i: number): string {
  const start = i * SLOT_DEG - 90; // -90 porque SVG tiene 0° a la derecha
  const end = start + SLOT_DEG;
  const r = 100;
  const sx = 100 + r * Math.cos((start * Math.PI) / 180);
  const sy = 100 + r * Math.sin((start * Math.PI) / 180);
  const ex = 100 + r * Math.cos((end * Math.PI) / 180);
  const ey = 100 + r * Math.sin((end * Math.PI) / 180);
  const largeArc = SLOT_DEG > 180 ? 1 : 0;
  return `M100,100 L${sx.toFixed(3)},${sy.toFixed(3)} A${r},${r} 0 ${largeArc} 1 ${ex.toFixed(3)},${ey.toFixed(3)} Z`;
}

/** Posición del texto en el centro del sector `i`. */
function slotLabelPos(i: number): { x: number; y: number; angle: number } {
  const mid = i * SLOT_DEG + SLOT_DEG / 2 - 90;
  const r = 64;
  const x = 100 + r * Math.cos((mid * Math.PI) / 180);
  const y = 100 + r * Math.sin((mid * Math.PI) / 180);
  return { x, y, angle: mid + 90 };
}

type WheelPhase = "idle" | "spinning" | "landed";

function RouletteWheel({
  phase,
  targetIndex,
}: {
  phase: WheelPhase;
  targetIndex: number | null;
}) {
  const [rotation, setRotation] = useState(0);
  const prevPhaseRef = useRef<WheelPhase>("idle");

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev !== "spinning" && phase === "spinning" && targetIndex !== null) {
      // Giro: 6 vueltas completas + el offset necesario para que el puntero
      // (arriba, ángulo 0) quede sobre el centro del sector objetivo.
      const targetDeg = targetIndex * SLOT_DEG + SLOT_DEG / 2;
      // Normalizamos sobre la rotación acumulada actual para que nunca gire
      // "hacia atrás" y el giro se sienta continuo si el usuario repite.
      const base = Math.ceil(rotation / 360) * 360;
      const next = base + 360 * 6 - targetDeg;
      setRotation(next);
    }
    if (phase === "idle" && prev === "landed") {
      // Volver visualmente a una orientación limpia sin transición brusca.
      setRotation((r) => r % 360);
    }
  }, [phase, targetIndex, rotation]);

  const transition =
    phase === "spinning"
      ? "transform 5200ms cubic-bezier(0.17, 0.67, 0.2, 1)"
      : phase === "landed"
        ? "transform 300ms ease"
        : "none";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px] select-none">
      {/* Puntero fijo arriba */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
        <div
          className="h-0 w-0"
          style={{
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: "18px solid #991b1b",
            filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.25))",
          }}
        />
      </div>
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full drop-shadow-md"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="wheel-ring" cx="50%" cy="50%" r="50%">
            <stop offset="85%" stopColor="#fca5a5" />
            <stop offset="100%" stopColor="#b91c1c" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="100" fill="url(#wheel-ring)" />
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "100px 100px",
            transition,
          }}
        >
          <circle cx="100" cy="100" r="96" fill="#fff1f2" />
          {WHEEL_SLOTS.map((slot, i) => {
            const { x, y, angle } = slotLabelPos(i);
            return (
              <g key={i}>
                <path
                  d={slotPath(i)}
                  fill={slot.color}
                  stroke="#b91c1c"
                  strokeWidth={0.8}
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight={700}
                  fill="#7f1d1d"
                  transform={`rotate(${angle} ${x} ${y})`}
                >
                  {slot.label}
                </text>
              </g>
            );
          })}
          {/* separadores radiales suaves */}
          {WHEEL_SLOTS.map((_, i) => {
            const a = (i * SLOT_DEG - 90) * (Math.PI / 180);
            const x2 = 100 + 96 * Math.cos(a);
            const y2 = 100 + 96 * Math.sin(a);
            return (
              <line
                key={`line-${i}`}
                x1={100}
                y1={100}
                x2={x2}
                y2={y2}
                stroke="#ef4444"
                strokeOpacity={0.35}
                strokeWidth={0.6}
              />
            );
          })}
        </g>
        {/* centro */}
        <circle cx="100" cy="100" r="10" fill="#991b1b" />
        <circle cx="100" cy="100" r="5" fill="#fecaca" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card de premio con countdown y "live dot"                           */
/* ------------------------------------------------------------------ */

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
  );
}

function PrizeCard({
  prize,
  onRedeem,
  onExpired,
  onRequestClose,
}: {
  prize: NonNullable<RouletteStatusDto["activePrize"]>;
  onRedeem: () => void;
  onExpired: () => void;
  /** Pulsar el botón "Cerrar" de la card (abre el confirm de descarte). */
  onRequestClose: () => void;
}) {
  const expiresAtMs = useMemo(
    () => new Date(prize.expiresAt).getTime(),
    [prize.expiresAt],
  );
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (expiredRef.current) return;
    if (now >= expiresAtMs) {
      expiredRef.current = true;
      onExpired();
    }
  }, [now, expiresAtMs, onExpired]);

  const remaining = expiresAtMs - now;
  const totalMs = 15 * 60 * 1000;
  const progress = Math.max(0, Math.min(1, remaining / totalMs));
  const lowTime = remaining < 2 * 60 * 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
          En vivo · Premio activo
        </span>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 p-5 text-amber-900 shadow-inner">
        <p className="text-sm font-medium">Enhorabuena, acabas de ganar</p>
        <p className="mt-1 text-2xl font-bold leading-tight">
          {prize.prizeLabel}
        </p>
        <p className="mt-3 text-sm leading-snug text-amber-800">
          Acércate a cualquiera de nuestras taquillas para canjear tu premio.
        </p>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs font-medium">
            <span>Tiempo restante</span>
            <span
              className={`font-mono text-base ${
                lowTime
                  ? "animate-pulse text-red-700"
                  : "text-amber-900"
              }`}
            >
              {formatClock(remaining)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-amber-50">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                lowTime ? "bg-red-500" : "bg-amber-600"
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {prize.shadow ? (
          <p className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-[11px] leading-snug text-amber-900">
            Modo demo (CY1000): este premio es simulado y no consume stock real.
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={onRedeem}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:scale-[0.99]"
        >
          Canjear premio
        </button>
        <p className="text-center text-xs text-muted">
          Pulsa el botón cuando estés en la taquilla.
        </p>
      </div>
      <button
        type="button"
        onClick={onRequestClose}
        className="inline-flex w-full items-center justify-center rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-zinc-50"
      >
        Cerrar
      </button>
      <p className="text-center text-xs text-muted">
        Si no lo canjeas antes de que acabe el tiempo, el premio caducará y
        volverá al stock del día.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Host principal                                                      */
/* ------------------------------------------------------------------ */

type View =
  | "closed"
  | "welcome"
  | "wheel"
  | "prize"
  | "prize-discard-confirm"
  | "lose"
  | "redeem-scan"
  | "redeem-ok"
  | "expired"
  | "discarded";

export function RouletteHost() {
  const [status, setStatus] = useState<RouletteStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("closed");
  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [lastSpin, setLastSpin] = useState<SpinResultDto | null>(null);
  const [wheelPhase, setWheelPhase] = useState<WheelPhase>("idle");
  const [wheelTarget, setWheelTarget] = useState<number | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemOkMsg, setRedeemOkMsg] = useState<{
    label: string;
    validatorName: string | null;
  } | null>(null);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/app/roulette/status", {
        cache: "no-store",
      });
      if (!res.ok) {
        setLoadError("No se pudo cargar tu estado de la ruleta");
        return;
      }
      const data = (await res.json()) as RouletteStatusDto;
      setStatus(data);
      setLoadError(null);
    } catch {
      setLoadError("Error de red al cargar la ruleta");
    }
  }, []);

  useEffect(() => {
    // Carga inicial del estado de la ruleta al montar el host en el feed.
    // `loadStatus` hace fetch y persiste el resultado con setState. La regla
    // `react-hooks/set-state-in-effect` avisa del patrón "setState dentro de
    // un efecto", pero aquí es intencionado: es un `useEffect` de tipo
    // "sincronizar con sistema externo" (API HTTP) en el montaje inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

  const closeAll = useCallback(() => {
    setView("closed");
    setSpinError(null);
    setRedeemError(null);
    setDiscardError(null);
    setLastSpin(null);
    setWheelPhase("idle");
    setWheelTarget(null);
    setRedeemOkMsg(null);
  }, []);

  const openFromButton = useCallback(() => {
    if (!status) return;
    if (status.activePrize) {
      setView("prize");
      return;
    }
    if (status.disabled) return;
    setView("welcome");
  }, [status]);

  const handleSpin = useCallback(async () => {
    if (spinning) return;
    setSpinError(null);
    setSpinning(true);
    setWheelPhase("idle");
    setWheelTarget(null);
    try {
      const res = await fetch("/api/app/roulette/spin", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | (SpinResultDto & { error?: string })
        | null;
      if (!res.ok || !data || "error" in data && data.error) {
        setSpinError(
          (data && "error" in data ? data.error : null) ??
            "No se pudo procesar la tirada",
        );
        setSpinning(false);
        await loadStatus();
        return;
      }
      const result: SpinResultDto = {
        outcome: data.outcome,
        prizeType: data.prizeType,
        prizeLabel: data.prizeLabel,
        prizeId: data.prizeId,
        expiresAt: data.expiresAt,
        spinsRemaining: data.spinsRemaining,
        shadow: data.shadow,
      };
      setLastSpin(result);
      const target = pickTargetSlotIndex(result);
      setWheelTarget(target);
      setWheelPhase("spinning");
      // Esperamos a que termine la animación (coincide con transition 5200ms).
      window.setTimeout(() => {
        setWheelPhase("landed");
        setSpinning(false);
        if (result.outcome === "win") {
          void loadStatus().then(() => setView("prize"));
        } else {
          void loadStatus();
          setView("lose");
        }
      }, 5400);
    } catch {
      setSpinError("Error de red al lanzar la tirada");
      setSpinning(false);
      await loadStatus();
    }
  }, [spinning, loadStatus]);

  const handleScanResult = useCallback(
    async (raw: string) => {
      if (!status?.activePrize) return;
      const prizeId = status.activePrize.prizeId;
      setRedeemBusy(true);
      setRedeemError(null);
      try {
        const res = await fetch("/api/app/roulette/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prizeId, qrText: raw }),
        });
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              prizeLabel?: string;
              validatorName?: string | null;
              error?: string;
            }
          | null;
        if (!res.ok || !data?.ok) {
          setRedeemError(data?.error ?? "No se pudo canjear el premio");
          setView("redeem-scan");
          return;
        }
        setRedeemOkMsg({
          label: data.prizeLabel ?? status.activePrize.prizeLabel,
          validatorName: data.validatorName ?? null,
        });
        setView("redeem-ok");
        await loadStatus();
      } catch {
        setRedeemError("Error de red al canjear el premio");
        setView("redeem-scan");
      } finally {
        setRedeemBusy(false);
      }
    },
    [status, loadStatus],
  );

  const handleExpired = useCallback(() => {
    setView("expired");
    void loadStatus();
  }, [loadStatus]);

  const handleDiscardConfirm = useCallback(async () => {
    if (!status?.activePrize) return;
    if (discardBusy) return;
    const prizeId = status.activePrize.prizeId;
    setDiscardBusy(true);
    setDiscardError(null);
    try {
      const res = await fetch("/api/app/roulette/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prizeId }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setDiscardError(data?.error ?? "No se pudo descartar el premio");
        return;
      }
      await loadStatus();
      setView("discarded");
    } catch {
      setDiscardError("Error de red al descartar el premio");
    } finally {
      setDiscardBusy(false);
    }
  }, [status, discardBusy, loadStatus]);

  // Aviso nativo del navegador al cerrar pestaña/refresh mientras haya
  // premio activo. Evita cierres accidentales. No descarta el premio: al
  // volver a la app, el socio podrá canjearlo mientras no caduque.
  useEffect(() => {
    if (!status?.activePrize) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Aunque Chrome/Safari ignoran el mensaje custom, otros navegadores
      // lo respetan. Dejarlo no-vacío asegura que se muestre el diálogo.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status?.activePrize]);

  return (
    <>
      <RouletteButton status={status} onClick={openFromButton} />
      {loadError ? (
        <p className="mt-2 text-xs text-red-700">{loadError}</p>
      ) : null}

      {/* Welcome */}
      <Modal
        open={view === "welcome"}
        onClose={closeAll}
        labelledBy="roulette-welcome-title"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <RouletteIcon className="h-6 w-6 text-amber-700" />
            <h2
              id="roulette-welcome-title"
              className="text-lg font-semibold text-amber-900"
            >
              Ruleta de la Suerte
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            Bienvenido a la Ruleta de la Suerte de La Cayetana. Dispones de{" "}
            <b>
              {status?.spinsRemaining === null
                ? "tiradas ilimitadas"
                : `${status?.spinsRemaining ?? 0} tirada${(status?.spinsRemaining ?? 0) === 1 ? "" : "s"}`}
            </b>{" "}
            para intentar ganar premios. Si resultas ganador, tendrás{" "}
            <b>15 minutos</b> para acercarte a cualquiera de nuestras taquillas
            y canjear tu premio. ¡Mucha suerte!
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeAll}
              className="flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm text-foreground hover:bg-zinc-50"
            >
              Ahora no
            </button>
            <button
              type="button"
              onClick={() => setView("wheel")}
              className="flex-1 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
            >
              Jugar
            </button>
          </div>
        </div>
      </Modal>

      {/* Wheel. Bloqueado: ni tap fuera ni Escape cierran. Solo se puede
          cerrar con la X explícita (y nunca mientras gira). */}
      <Modal
        open={view === "wheel"}
        onClose={() => {}}
        allowClose={false}
        labelledBy="roulette-wheel-title"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="roulette-wheel-title"
              className="text-lg font-semibold text-amber-900"
            >
              ¡Gira la ruleta!
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                <CounterLabel status={status} />
              </span>
              <button
                type="button"
                onClick={closeAll}
                disabled={spinning}
                aria-label="Cerrar ruleta"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-muted transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
          <RouletteWheel phase={wheelPhase} targetIndex={wheelTarget} />
          {spinError ? (
            <p className="text-center text-sm text-red-700">{spinError}</p>
          ) : null}
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning || (status?.disabled ?? false)}
            className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
          >
            {spinning ? "Girando…" : "Girar"}
          </button>
        </div>
      </Modal>

      {/* Lose (tras animación de sector perdedor) */}
      <Modal
        open={view === "lose"}
        onClose={closeAll}
        labelledBy="roulette-lose-title"
      >
        <div className="space-y-4 text-center">
          <h2
            id="roulette-lose-title"
            className="text-lg font-semibold text-foreground"
          >
            Esta vez no ha sido…
          </h2>
          <p className="text-sm text-muted">
            {status?.disabled
              ? "Has usado todas tus tiradas. Vuelve en la próxima apertura para intentarlo otra vez."
              : "¡Mucho ánimo! Aún te quedan tiradas. ¿Pruebas de nuevo?"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeAll}
              className="flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm text-foreground hover:bg-zinc-50"
            >
              Cerrar
            </button>
            {!status?.disabled ? (
              <button
                type="button"
                onClick={() => {
                  setLastSpin(null);
                  setWheelPhase("idle");
                  setWheelTarget(null);
                  setView("wheel");
                }}
                className="flex-1 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
              >
                Otra tirada
              </button>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Prize card (bloqueada: solo cierra por canje, caducidad o descarte
          explícito desde el confirm). */}
      <Modal
        open={view === "prize" || view === "prize-discard-confirm"}
        onClose={closeAll}
        allowClose={false}
        labelledBy="roulette-prize-title"
      >
        <h2 id="roulette-prize-title" className="sr-only">
          Premio activo
        </h2>
        {status?.activePrize ? (
          <PrizeCard
            prize={status.activePrize}
            onRedeem={() => {
              setRedeemError(null);
              setView("redeem-scan");
            }}
            onExpired={handleExpired}
            onRequestClose={() => {
              setDiscardError(null);
              setView("prize-discard-confirm");
            }}
          />
        ) : (
          <p className="text-sm text-muted">
            No hay ningún premio activo ahora mismo.
          </p>
        )}
      </Modal>

      {/* Confirm de descarte voluntario (se monta encima de la card de
          premio, que sigue abajo con el timer corriendo). */}
      <Modal
        open={view === "prize-discard-confirm"}
        onClose={() => setView("prize")}
        allowClose={!discardBusy}
        labelledBy="roulette-discard-confirm-title"
      >
        <div className="space-y-4">
          <h2
            id="roulette-discard-confirm-title"
            className="text-lg font-semibold text-foreground"
          >
            ¿Seguro que quieres cerrar?
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Cuidado: si cierras sin validar perderás el premio y no podrás
            recuperarlo.
          </p>
          {discardError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {discardError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleDiscardConfirm()}
              disabled={discardBusy}
              className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {discardBusy ? "Descartando…" : "Sí, perder el premio"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (discardBusy) return;
                setDiscardError(null);
                setView("prize");
              }}
              disabled={discardBusy}
              className="flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-zinc-50 disabled:opacity-60"
            >
              Volver al premio
            </button>
          </div>
        </div>
      </Modal>

      {/* Info post-descarte. */}
      <Modal
        open={view === "discarded"}
        onClose={closeAll}
        labelledBy="roulette-discarded-title"
      >
        <div className="space-y-4 text-center">
          <h2
            id="roulette-discarded-title"
            className="text-lg font-semibold text-foreground"
          >
            Has descartado tu premio
          </h2>
          <p className="text-sm text-muted">
            El premio ya no está disponible para ti. Seguirás pudiendo jugar
            tus próximas tiradas cuando vuelva a abrirse la Ruleta.
          </p>
          <button
            type="button"
            onClick={closeAll}
            className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            Entendido
          </button>
        </div>
      </Modal>

      {/* Redeem: scanner QR */}
      <QrScannerModal
        open={view === "redeem-scan"}
        onClose={() => {
          if (redeemBusy) return;
          setView(status?.activePrize ? "prize" : "closed");
        }}
        onResult={(raw) => void handleScanResult(raw)}
        title="Escanea el QR de taquilla"
        hint="Escanea el QR que te muestra en taquilla"
      />

      {/* Error de canje: modal encima del scanner cerrado (reintentar) */}
      {view === "redeem-scan" && redeemError ? (
        <div
          className="fixed inset-x-0 bottom-4 z-[60] mx-auto w-[92%] max-w-sm rounded-2xl bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
          role="alert"
        >
          {redeemError}
        </div>
      ) : null}

      {/* Redeem OK */}
      <Modal
        open={view === "redeem-ok"}
        onClose={closeAll}
        labelledBy="roulette-redeem-ok-title"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            id="roulette-redeem-ok-title"
            className="text-lg font-semibold text-foreground"
          >
            ¡Canje realizado!
          </h2>
          <p className="text-sm text-muted">
            Has canjeado: <b>{redeemOkMsg?.label ?? "tu premio"}</b>.
            {redeemOkMsg?.validatorName
              ? ` Validado por ${redeemOkMsg.validatorName}.`
              : ""}
          </p>
          <button
            type="button"
            onClick={closeAll}
            className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            Cerrar
          </button>
        </div>
      </Modal>

      {/* Expired */}
      <Modal
        open={view === "expired"}
        onClose={closeAll}
        labelledBy="roulette-expired-title"
      >
        <div className="space-y-4 text-center">
          <h2
            id="roulette-expired-title"
            className="text-lg font-semibold text-foreground"
          >
            El premio ha caducado
          </h2>
          <p className="text-sm text-muted">
            No ha dado tiempo a canjearlo. Lo hemos devuelto al stock de hoy
            para que otro socio pueda ganarlo. ¡Suerte en la próxima tirada!
          </p>
          <button
            type="button"
            onClick={closeAll}
            className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            Entendido
          </button>
        </div>
      </Modal>

      {/* silenciar warning de lint sobre lastSpin no usado directamente */}
      {lastSpin ? null : null}
    </>
  );
}
