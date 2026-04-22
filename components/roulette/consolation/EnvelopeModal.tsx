"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  /** Pulsar "Recoger premio": abre el rasca. */
  onOpenScratch: () => void;
  /** Cerrar el sobre sin abrirlo: el rasca queda pendiente hasta caducar. */
  onClose: () => void;
};

/**
 * Modal de presentación del regalo seguro. Muestra un sobre rojo estilizado
 * con el remitente y el texto "Regalo Seguro". No contiene lógica de estado
 * ni timers: solo presenta el CTA para pasar al rasca. El countdown corre
 * en `ScratchCard` y el contador real lo guarda el backend en `expiresAt`.
 */
export function EnvelopeModal({ open, onOpenScratch, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consolation-envelope-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            ¡Sorpresa para ti!
          </p>
          <h2
            id="consolation-envelope-title"
            className="text-2xl font-extrabold text-red-700"
          >
            Regalo Seguro
          </h2>

          {/* Sobre rojo SVG */}
          <div className="relative mx-auto aspect-[5/3] w-full max-w-[340px]">
            <div
              className="absolute inset-0 -rotate-1 animate-[float_3.5s_ease-in-out_infinite] motion-reduce:animate-none"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 500 300"
                className="h-full w-full drop-shadow-[0_10px_30px_rgba(220,38,38,0.45)]"
              >
                <defs>
                  <linearGradient id="env-red" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#b91c1c" />
                  </linearGradient>
                  <linearGradient id="env-red-dark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" />
                    <stop offset="100%" stopColor="#7f1d1d" />
                  </linearGradient>
                  <radialGradient id="env-seal" cx="50%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#fde68a" />
                    <stop offset="55%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#92400e" />
                  </radialGradient>
                </defs>
                <rect
                  x="10"
                  y="30"
                  width="480"
                  height="250"
                  rx="14"
                  fill="url(#env-red)"
                  stroke="#7f1d1d"
                  strokeWidth="2"
                />
                <polygon
                  points="10,30 250,190 490,30"
                  fill="url(#env-red-dark)"
                  stroke="#7f1d1d"
                  strokeWidth="2"
                />
                <polygon
                  points="10,280 200,150 300,150 490,280"
                  fill="#dc2626"
                  stroke="#7f1d1d"
                  strokeWidth="2"
                  opacity="0.85"
                />
                {/* Sello dorado */}
                <g transform="translate(250,170)">
                  <circle r="34" fill="url(#env-seal)" stroke="#78350f" strokeWidth="1.5" />
                  <text
                    x="0"
                    y="5"
                    textAnchor="middle"
                    fontSize="22"
                    fontWeight="900"
                    fill="#7f1d1d"
                    fontFamily="Georgia, 'Times New Roman', serif"
                  >
                    LC
                  </text>
                </g>
                {/* Pequeños confetis */}
                {[
                  { x: 60, y: 60, f: "#fbbf24" },
                  { x: 440, y: 80, f: "#fbbf24" },
                  { x: 80, y: 250, f: "#fde68a" },
                  { x: 430, y: 250, f: "#fde68a" },
                  { x: 250, y: 45, f: "#fef3c7" },
                ].map((c, i) => (
                  <circle key={i} cx={c.x} cy={c.y} r="3.5" fill={c.f} />
                ))}
              </svg>
            </div>
            <style jsx>{`
              @keyframes float {
                0%,
                100% {
                  transform: translateY(0) rotate(-1deg);
                }
                50% {
                  transform: translateY(-6px) rotate(-1deg);
                }
              }
            `}</style>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Remitente
            </p>
            <p className="text-base font-semibold text-foreground">
              La Cayetana
            </p>
          </div>

          <p className="text-sm leading-relaxed text-muted">
            Las tiradas de hoy no han salido como queríamos, así que queremos
            dejarte un detalle por haberlo intentado. Ábrelo para descubrir tu
            recompensa.
          </p>

          <button
            type="button"
            onClick={onOpenScratch}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition-colors hover:bg-red-700 active:scale-[0.99]"
          >
            Recoger premio
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-zinc-50"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
