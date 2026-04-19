"use client";

import { useEffect, useState } from "react";
import type { EventRecord } from "@/types/models";

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatEvent(iso: string, today: Date) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    iso,
    isToday: sameLocalDay(d, today),
  };
}

/**
 * Feed de eventos publicados. El componente es client-side para que la
 * etiqueta "Hoy" se calcule con el huso horario del navegador del usuario,
 * no con el del servidor.
 */
export function EventFeedList({ events }: { events: EventRecord[] }) {
  // `today` se reemplaza tras el primer render del cliente para evitar
  // diferencias entre servidor y navegador (Date al montar el componente).
  const [today, setToday] = useState<Date>(() => new Date());
  useEffect(() => {
    setToday(new Date());
  }, []);

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted">
        Aún no hay eventos programados. Vuelve más tarde.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {events.map((ev) => {
        const { date, time, iso, isToday } = formatEvent(ev.startAt, today);
        return (
          <li
            key={ev.id}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por /api/programacion/image */}
              <img
                src={`/api/programacion/image?key=${encodeURIComponent(ev.imageKey)}`}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <time className="text-xs text-muted" dateTime={iso}>
                  {date} · {time}
                </time>
                {isToday ? (
                  <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700 ring-1 ring-inset ring-pink-200">
                    Hoy
                  </span>
                ) : null}
              </div>
              <h2 className="text-lg font-semibold leading-snug">{ev.title}</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted">
                {ev.description}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
