"use client";

import { useEffect, useState } from "react";

function formatTime(d: Date): string {
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function LiveClock() {
  const [now, setNow] = useState<string>(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => {
      setNow(formatTime(new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p
      className="mt-2 text-center font-mono text-xs tabular-nums text-muted"
      aria-live="polite"
      suppressHydrationWarning
    >
      {now}
    </p>
  );
}
