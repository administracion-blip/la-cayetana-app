"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Props = {
  /** Etiqueta que aparece al rascar (ej. "DESCUENTO DE 1€ EN TUS COPAS"). */
  rewardLabel: string;
  /** ISO absoluto que el backend fijó al crear el rasca. */
  expiresAt: string;
  /**
   * Se dispara cuando `expiresAt` venció. El host debería cambiar a la vista
   * de "caducado" y llamar a `/api/app/roulette/status` para sincronizar.
   */
  onExpired: () => void;
  /** Pulsa "Canjear": abre el scanner. Sólo visible tras descubrir. */
  onRequestRedeem: () => void;
  /** Cerrar temporalmente (el rasca sigue vivo en backend hasta caducar). */
  onClose: () => void;
  /** Texto informativo bajo el botón de canjear. */
  redeemHint?: string;
};

const REVEAL_THRESHOLD = 0.55;
const SAMPLE_STEP = 6; // muestreamos 1 de cada N píxeles (alpha) para ir rápido.

/**
 * Formatea ms restantes como `MM:SS`. El tope mínimo es `00:00`.
 */
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

/**
 * Lienzo de "rasca y gana" con un `<canvas>` que se descubre al arrastrar.
 *
 * El mecanismo usa `globalCompositeOperation = "destination-out"` para ir
 * borrando la capa opaca y dejar ver el contenido de debajo (el `rewardLabel`).
 * Cada `pointerup` muestreamos el alpha del canvas para decidir si el usuario
 * ha descubierto suficiente (por defecto 55%). Cuando sucede, se llama a
 * `onReveal()` y aparece el botón "Canjear".
 *
 * El contador de caducidad es solo feedback visual. La autoridad real es el
 * backend, que rechazará cualquier canje tras `expiresAt`.
 */
export function ScratchCard({
  rewardLabel,
  expiresAt,
  onExpired,
  onRequestRedeem,
  onClose,
  redeemHint = "Importante: Acércate a la taquilla antes de pulsar canjear",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastSampleRef = useRef(0);
  const revealedRef = useRef(false);
  const expiredRef = useRef(false);

  const [revealed, setRevealed] = useState(false);
  const expiresAtMs = useMemo(
    () => new Date(expiresAt).getTime(),
    [expiresAt],
  );
  const [now, setNow] = useState(() => Date.now());

  // ── Countdown ────────────────────────────────────────────────────────────
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

  // ── Inicialización del canvas ────────────────────────────────────────────
  const paintScratchLayer = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Capa plateada con ligero gradiente
    const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    grad.addColorStop(0, "#d4d4d8");
    grad.addColorStop(0.5, "#a1a1aa");
    grad.addColorStop(1, "#71717a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Patrón sutil de ruido
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * rect.width;
      const y = Math.random() * rect.height;
      ctx.fillStyle = Math.random() > 0.5 ? "#000" : "#fff";
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Mensaje "Rasca aquí"
    ctx.fillStyle = "rgba(24, 24, 27, 0.65)";
    ctx.font = "bold 20px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✨ Rasca aquí ✨", rect.width / 2, rect.height / 2);
  }, []);

  useEffect(() => {
    paintScratchLayer();
    function onResize() {
      // Re-pintamos el overlay al cambiar de tamaño. Se pierde el progreso
      // visual, pero la semántica (canjeable/no) la sigue controlando el
      // backend: el rasca sigue vivo hasta caducar.
      if (revealedRef.current) return;
      paintScratchLayer();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paintScratchLayer]);

  // ── Interacción ──────────────────────────────────────────────────────────
  const drawAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
  }, []);

  const sampleRevealRatio = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let total = 0;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4 * SAMPLE_STEP) {
      total++;
      if (data[i] === 0) transparent++;
    }
    return total === 0 ? 0 : transparent / total;
  }, []);

  const maybeReveal = useCallback(() => {
    if (revealedRef.current) return;
    const ratio = sampleRevealRatio();
    if (ratio >= REVEAL_THRESHOLD) {
      revealedRef.current = true;
      setRevealed(true);
      // Borramos el resto del canvas para una revelación "clean" completa.
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [sampleRevealRatio]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (revealedRef.current) return;
      isDrawingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drawAt(e.clientX, e.clientY);
    },
    [drawAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      drawAt(e.clientX, e.clientY);
      // Muestreamos cada ~150ms para aliviar el main thread.
      const t = performance.now();
      if (t - lastSampleRef.current > 150) {
        lastSampleRef.current = t;
        maybeReveal();
      }
    },
    [drawAt, maybeReveal],
  );

  const onPointerUp = useCallback(() => {
    isDrawingRef.current = false;
    maybeReveal();
  }, [maybeReveal]);

  // ── Derivados del contador ───────────────────────────────────────────────
  const remaining = expiresAtMs - now;
  const totalMs = 20 * 60 * 1000;
  const progress = Math.max(0, Math.min(1, remaining / totalMs));
  const lowTime = remaining < 2 * 60 * 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
          En vivo · Regalo seguro
        </span>
      </div>

      {/* Tarjeta rasca */}
      <div className="rounded-2xl bg-gradient-to-br from-red-50 to-amber-50 p-4 text-red-900 shadow-inner">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
          Tu regalo
        </p>
        <div
          ref={wrapperRef}
          className="relative mt-2 w-full overflow-hidden rounded-xl bg-amber-100"
          style={{ aspectRatio: "5 / 3" }}
        >
          {/* Capa de fondo con el texto del premio */}
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
            <span className="text-lg font-extrabold leading-tight text-red-700 sm:text-xl">
              {rewardLabel}
            </span>
          </div>
          {/* Canvas rascable */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Zona rascable"
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs font-medium">
            <span>Tiempo restante</span>
            <span
              className={`font-mono text-base ${
                lowTime ? "animate-pulse text-red-700" : "text-red-900"
              }`}
            >
              {formatClock(remaining)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                lowTime ? "bg-red-600" : "bg-red-500"
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Botón canjear SOLO si se ha descubierto suficiente */}
      {revealed ? (
        <div className="space-y-1">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">
            {redeemHint}
          </p>
          <button
            type="button"
            onClick={onRequestRedeem}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:scale-[0.99]"
          >
            Canjear
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">
          Arrastra el dedo sobre la tarjeta para descubrir tu regalo.
        </p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="inline-flex w-full items-center justify-center rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-zinc-50"
      >
        Cerrar
      </button>
      <p className="text-center text-xs text-muted">
        Si no lo canjeas antes de que acabe el tiempo, el regalo caducará.
      </p>
    </div>
  );
}
