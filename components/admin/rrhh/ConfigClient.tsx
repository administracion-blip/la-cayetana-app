"use client";

import { useEffect, useState } from "react";

export function ConfigClient() {
  const [jornadaStartHour, setJornadaStartHour] = useState(6);
  const [toleranceMin, setToleranceMin] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { type: "ok" | "error"; message: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/rrhh/config", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as
          | { jornadaStartHour?: number; toleranceMin?: number }
          | null;
        if (cancelled || !data) return;
        if (typeof data.jornadaStartHour === "number")
          setJornadaStartHour(data.jornadaStartHour);
        if (typeof data.toleranceMin === "number")
          setToleranceMin(data.toleranceMin);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/rrhh/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jornadaStartHour, toleranceMin }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setFeedback({
          type: "error",
          message: data?.error ?? "No se pudo guardar la configuración",
        });
        return;
      }
      setFeedback({ type: "ok", message: "Configuración guardada." });
    } catch {
      setFeedback({ type: "error", message: "Error de red al guardar." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted shadow-sm">
        Cargando configuración…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <label
          htmlFor="cfg-jornada"
          className="mb-1 block text-sm font-semibold"
        >
          Hora límite de jornada
        </label>
        <div className="flex items-center gap-2">
          <input
            id="cfg-jornada"
            type="number"
            min={0}
            max={23}
            value={jornadaStartHour}
            onChange={(e) => setJornadaStartHour(Number(e.target.value))}
            className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
          <span className="text-sm text-muted">h</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Hora de corte que separa una jornada de la siguiente. Lo anterior a
          esta hora cuenta como la jornada del día previo, y los turnos abiertos
          se cierran automáticamente al llegar esta hora.
        </p>
      </div>

      <div>
        <label htmlFor="cfg-tol" className="mb-1 block text-sm font-semibold">
          Margen de tolerancia
        </label>
        <div className="flex items-center gap-2">
          <input
            id="cfg-tol"
            type="number"
            min={0}
            max={120}
            value={toleranceMin}
            onChange={(e) => setToleranceMin(Number(e.target.value))}
            className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
          <span className="text-sm text-muted">min</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Minutos de margen para considerar correcto un fichaje respecto al
          turno (entrada, salida y total de horas).
        </p>
      </div>

      {feedback ? (
        <p
          className={`text-sm ${
            feedback.type === "ok" ? "text-emerald-700" : "text-red-600"
          }`}
          role="alert"
        >
          {feedback.message}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
