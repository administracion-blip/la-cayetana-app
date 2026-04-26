"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Site key pública de Cloudflare Turnstile. Se inyecta en build via
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Si no está definida, el widget se
 * autodesactiva: el componente no renderiza nada y `useCaptchaEnabled`
 * devuelve `false`. Esto permite seguir usando los formularios en
 * desarrollo sin claves de Turnstile.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function isCaptchaEnabledOnClient(): boolean {
  return typeof SITE_KEY === "string" && SITE_KEY.length > 0;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${TURNSTILE_SRC.split("?")[0]}"]`,
    );
    if (existing) {
      if (window.turnstile) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("turnstile script failed")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  /** Callback con el token cuando el usuario lo resuelve (o null al expirar). */
  onToken: (token: string | null) => void;
  /** Tema; por defecto `auto`. */
  theme?: "light" | "dark" | "auto";
}

/**
 * Renderiza el widget de Cloudflare Turnstile. No bloquea el formulario:
 * si la site key no está configurada o el script no se carga, simplemente
 * no se muestra nada (la UX queda igual que antes). El consumidor decide
 * si exigir el token o no.
 *
 * El componente se autoresetea al expirar el token.
 */
export function TurnstileField({ onToken, theme = "auto" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled) return;
        if (!containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme,
          size: "flexible",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        // ignore
      }
    };
  }, [onToken, theme]);

  if (!SITE_KEY) return null;

  return (
    <div className="flex flex-col items-stretch">
      <div
        ref={containerRef}
        id={`turnstile-${id}`}
        aria-label="Verificación anti-bot"
      />
      {failed ? (
        <p className="mt-2 text-xs text-muted">
          No se pudo cargar la verificación anti-bot. Recarga la página si el
          envío falla.
        </p>
      ) : null}
    </div>
  );
}
