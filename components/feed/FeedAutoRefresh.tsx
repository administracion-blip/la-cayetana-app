"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Refresca silenciosamente la página servidor cada 10 minutos llamando a
 * `router.refresh()`. Esto re-ejecuta el Server Component padre y vuelve a
 * traer la lista de eventos publicados sin recargar la página completa.
 *
 * - Se pausa mientras la pestaña no está visible para no gastar peticiones.
 * - Refresca también al volver a poner la pestaña en primer plano si ha
 *   pasado más de un intervalo desde la última actualización.
 */
export function FeedAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let lastRefresh = Date.now();

    function refresh() {
      lastRefresh = Date.now();
      router.refresh();
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, REFRESH_INTERVAL_MS);

    function onVisibility() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefresh >= REFRESH_INTERVAL_MS
      ) {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
