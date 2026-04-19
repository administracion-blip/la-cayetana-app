"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type PopupEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  imageKey: string;
};

/**
 * Cooldown (ms) entre apariciones consecutivas del pop up. Se persiste en
 * `localStorage` para que no vuelva a aparecer antes de tiempo aunque el
 * usuario recargue o cambie de página dentro de `/app`.
 */
const POPUP_COOLDOWN_MS = 60 * 60 * 1000;
const POPUP_STORAGE_KEY = "programacion_popup_last_shown";

function canShowNow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(POPUP_STORAGE_KEY);
    if (!raw) return true;
    const last = Number.parseInt(raw, 10);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= POPUP_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markShownNow() {
  try {
    window.localStorage.setItem(POPUP_STORAGE_KEY, String(Date.now()));
  } catch {
    // si localStorage no está disponible, aceptamos que se muestre más veces
  }
}

function formatStartAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/**
 * Host invisible que, al montarse en `/app`, consulta el popup de
 * programación y lo muestra como modal si ha pasado al menos 1h desde la
 * última vez (persistido en localStorage). Mientras la pestaña sigue abierta,
 * reprograma un nuevo intento cada hora.
 */
export function ProgramacionPopupHost() {
  const [event, setEvent] = useState<PopupEvent | null>(null);
  const timerRef = useRef<number | null>(null);
  const titleId = useId();

  const tryFetchAndShow = useCallback(async () => {
    let forced = false;
    try {
      if (sessionStorage.getItem("programacion_popup_force") === "1") {
        forced = true;
        sessionStorage.removeItem("programacion_popup_force");
      }
    } catch {
      // sessionStorage puede no estar disponible; tratamos como no forzado
    }
    if (!forced && !canShowNow()) return;
    try {
      const res = await fetch("/api/app/programacion/popup", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { event: PopupEvent | null }
        | null;
      if (!data?.event) return;
      if (!forced && !canShowNow()) return;
      setEvent(data.event);
      markShownNow();
    } catch {
      // silencio: el popup es opcional, no interrumpimos el feed por errores
    }
  }, []);

  useEffect(() => {
    const firstRun = window.setTimeout(() => {
      void tryFetchAndShow();
    }, 500);
    timerRef.current = window.setInterval(() => {
      void tryFetchAndShow();
    }, POPUP_COOLDOWN_MS);
    return () => {
      window.clearTimeout(firstRun);
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tryFetchAndShow]);

  useEffect(() => {
    if (!event) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEvent(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event]);

  if (!event) return null;

  const when = formatStartAt(event.startAt);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 px-3 pb-4 pt-10 sm:items-center sm:pb-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => setEvent(null)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por /api/programacion/image */}
          <img
            src={`/api/programacion/image?key=${encodeURIComponent(event.imageKey)}`}
            alt=""
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => setEvent(null)}
            aria-label="Cerrar"
            className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-md hover:bg-black/70"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          {when ? (
            <p className="mb-1 text-xs font-medium text-muted">{when}</p>
          ) : null}
          <h2
            id={titleId}
            className="text-lg font-semibold leading-snug"
          >
            {event.title}
          </h2>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted">
            {event.description}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setEvent(null)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
