import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Envoltorio del carnet digital con un borde animado (haz rojo recorriendo
 * el perímetro) y un indicador "LIVE" parpadeante. Sirve como señal visual
 * de que el carnet es la app en vivo y no una captura/foto: una imagen
 * estática no reproduce la animación.
 *
 * La animación se implementa con `@property --lc-border-angle` +
 * `conic-gradient`, definida en `app/globals.css` bajo `.live-border-card`.
 */
export function LiveBorderCard({ children, className }: Props) {
  return (
    <div
      className={
        "live-border-card w-full max-w-sm p-5" +
        (className ? ` ${className}` : "")
      }
    >
      <span className="live-border-dot" aria-hidden>
        Live
      </span>
      {children}
    </div>
  );
}
