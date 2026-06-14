"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/** Refresco del QR: algo menor que el TTL del token (40s) para que nunca caduque en pantalla. */
const REFRESH_MS = 25_000;

export function TerminalClient() {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/rrhh/clock/terminal-token", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | { token?: string; error?: string }
        | null;
      if (!res.ok || !data?.token) {
        setError(data?.error ?? "No se pudo generar el código");
        return;
      }
      setError(null);
      const origin = window.location.origin;
      setValue(`${origin}/fichar?t=${encodeURIComponent(data.token)}`);
    } catch {
      setError("Error de red al generar el código");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : value ? (
        <QRCodeSVG
          value={value}
          size={320}
          level="M"
          includeMargin
          className="h-auto w-full max-w-[320px]"
        />
      ) : (
        <p className="text-sm text-muted">Generando código…</p>
      )}
      <p className="text-center text-xs text-muted">
        Mantén esta pantalla abierta. El código se renueva automáticamente.
      </p>
    </div>
  );
}
