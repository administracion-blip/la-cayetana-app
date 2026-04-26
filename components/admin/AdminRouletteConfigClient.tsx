"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { PrizeStockMap, RouletteConfigRecord } from "@/types/models";

type StockKey = keyof PrizeStockMap;

const STOCK_KEYS: StockKey[] = [
  "copa",
  "tercio",
  "chupito",
  "rebujito",
  "botella",
];

const STOCK_LABELS: Record<StockKey, string> = {
  copa: "Copas",
  tercio: "Tercios",
  chupito: "Chupitos (premio x2)",
  rebujito: "Rebujitos",
  botella: "Botellas",
};

type FormState = {
  timezone: string;
  seasonStartDate: string;
  seasonEndDate: string;
  cycleStartHour: number;
  closedWindowStartHour: number;
  closedWindowEndHour: number;
  spinsPerCycle: number;
  /** Minutos visibles en UI; al servidor se envían convertidos a segundos. */
  redeemWindowMin: number;
  targetWinRate: number;
  dailyStock: Record<StockKey, number>;
  shadowMembershipId: string;
  shadowWinRate: number;
  consolationEnabled: boolean;
  /** Minutos visibles en UI; al servidor se envían convertidos a segundos. */
  consolationWindowMin: number;
  consolationRewardLabel: string;
};

const MIN_WINDOW_MIN = 1;
const MAX_WINDOW_MIN = 24 * 60;

function secToMin(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return MIN_WINDOW_MIN;
  return Math.min(MAX_WINDOW_MIN, Math.max(MIN_WINDOW_MIN, Math.round(sec / 60)));
}

function minToSec(min: number): number {
  if (!Number.isFinite(min)) return 60;
  const m = Math.min(MAX_WINDOW_MIN, Math.max(MIN_WINDOW_MIN, Math.round(min)));
  return m * 60;
}

function configToForm(c: RouletteConfigRecord): FormState {
  return {
    timezone: c.timezone,
    seasonStartDate:
      typeof c.seasonStartDate === "string" ? c.seasonStartDate : "",
    seasonEndDate: typeof c.seasonEndDate === "string" ? c.seasonEndDate : "",
    cycleStartHour: c.cycleStartHour,
    closedWindowStartHour: c.closedWindowStartHour,
    closedWindowEndHour: c.closedWindowEndHour,
    spinsPerCycle: c.spinsPerCycle,
    redeemWindowMin: secToMin(c.redeemWindowSec),
    targetWinRate: c.targetWinRate,
    dailyStock: Object.fromEntries(
      STOCK_KEYS.map((k) => [k, c.dailyStock[k] ?? 0]),
    ) as Record<StockKey, number>,
    shadowMembershipId: c.shadowMembershipId ?? "",
    shadowWinRate: c.shadowWinRate,
    consolationEnabled: c.consolationEnabled !== false,
    consolationWindowMin: secToMin(c.consolationWindowSec),
    consolationRewardLabel: c.consolationRewardLabel ?? "",
  };
}

function formToPayload(f: FormState): Record<string, unknown> {
  return {
    timezone: f.timezone.trim(),
    seasonStartDate:
      f.seasonStartDate.trim() === "" ? null : f.seasonStartDate.trim(),
    seasonEndDate:
      f.seasonEndDate.trim() === "" ? null : f.seasonEndDate.trim(),
    cycleStartHour: f.cycleStartHour,
    closedWindowStartHour: f.closedWindowStartHour,
    closedWindowEndHour: f.closedWindowEndHour,
    spinsPerCycle: f.spinsPerCycle,
    redeemWindowSec: minToSec(f.redeemWindowMin),
    targetWinRate: f.targetWinRate,
    dailyStock: STOCK_KEYS.reduce(
      (acc, k) => {
        acc[k] = Math.max(0, Math.floor(f.dailyStock[k] ?? 0));
        return acc;
      },
      {} as Record<StockKey, number>,
    ),
    shadowMembershipId: f.shadowMembershipId.trim().toUpperCase(),
    shadowWinRate: f.shadowWinRate,
    consolationEnabled: f.consolationEnabled,
    consolationWindowSec: minToSec(f.consolationWindowMin),
    consolationRewardLabel: f.consolationRewardLabel.trim(),
  };
}

export function AdminRouletteConfigClient() {
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roulette/config", {
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; config?: RouletteConfigRecord };
      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      if (!data.config) throw new Error("Respuesta inválida");
      setForm(configToForm(data.config));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = window.setTimeout(() => setStatusMsg(null), 3500);
    return () => window.clearTimeout(t);
  }, [statusMsg]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    if (!form.timezone.trim()) {
      setError("La zona horaria no puede estar vacía");
      setSaving(false);
      return;
    }
    if (!/^CY\d{3,}$/i.test(form.shadowMembershipId.trim())) {
      setError(
        "El carnet de prueba (shadow) debe tener formato CY seguido de números (ej. CY1000)",
      );
      setSaving(false);
      return;
    }
    if (form.consolationRewardLabel.trim().length === 0) {
      setError("El texto visible del rasca no puede estar vacío");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/roulette/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      const data = (await res.json()) as { error?: string; config?: RouletteConfigRecord };
      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      if (!data.config) throw new Error("Respuesta inválida");
      setForm(configToForm(data.config));
      setStatusMsg("Configuración guardada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Cargando configuración…</p>;
  }

  if (error && !form) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!form) return null;

  const update = (patch: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateStock = (key: StockKey, value: number) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            dailyStock: { ...prev.dailyStock, [key]: value },
          }
        : prev,
    );
  };

  return (
    <div className="space-y-6">
      {statusMsg ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {statusMsg}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Temporada (fechas)</h2>
        <p className="mt-1 text-sm text-muted">
          Fechas en calendario local de la zona configurada abajo (
          <strong>{form.timezone}</strong>
          ). Deja vacío un extremo para no limitar por ese lado. El socio
          shadow (carnet de prueba) no se ve afectado por la temporada.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Inicio (inclusivo)
            </span>
            <input
              type="date"
              value={form.seasonStartDate}
              onChange={(e) => update({ seasonStartDate: e.target.value })}
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Fin (inclusivo)
            </span>
            <input
              type="date"
              value={form.seasonEndDate}
              onChange={(e) => update({ seasonEndDate: e.target.value })}
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update({ seasonStartDate: "", seasonEndDate: "" })}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-muted/40"
          >
            Quitar ambas fechas (ruleta todo el año)
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Zona horaria y ciclo diario</h2>
        <p className="mt-1 text-sm text-muted">
          El ciclo empieza cada día a la hora indicada. La ventana &quot;cerrada&quot;
          es cuando no se permiten nuevas tiradas (p. ej. de 04:00 a 13:00).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-muted">Timezone IANA</span>
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
              className="rounded-xl border border-border px-3 py-2 font-mono text-sm"
              placeholder="Europe/Madrid"
            />
          </label>
          <NumberField
            label="Hora inicio ciclo (0–23)"
            value={form.cycleStartHour}
            onChange={(v) => update({ cycleStartHour: v })}
            min={0}
            max={23}
          />
          <NumberField
            label="Cierre: desde hora (0–23)"
            value={form.closedWindowStartHour}
            onChange={(v) => update({ closedWindowStartHour: v })}
            min={0}
            max={23}
          />
          <NumberField
            label="Cierre: hasta hora (0–23)"
            value={form.closedWindowEndHour}
            onChange={(v) => update({ closedWindowEndHour: v })}
            min={0}
            max={23}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Tiradas y probabilidad</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Tiradas por socio y ciclo"
            value={form.spinsPerCycle}
            onChange={(v) => update({ spinsPerCycle: v })}
            min={1}
            max={20}
          />
          <NumberField
            label="Minutos para canjear premio"
            value={form.redeemWindowMin}
            onChange={(v) => update({ redeemWindowMin: v })}
            min={MIN_WINDOW_MIN}
            max={MAX_WINDOW_MIN}
            hint="En servidor se guarda en segundos (minutos × 60)."
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Tasa objetivo de premio (0–1)
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min={0}
              max={1}
              value={form.targetWinRate}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) update({ targetWinRate: n });
              }}
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Stock diario por premio</h2>
        <p className="mt-1 text-sm text-muted">
          Unidades disponibles por tipo en cada ciclo de 24 h.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STOCK_KEYS.map((k) => (
            <NumberField
              key={k}
              label={STOCK_LABELS[k]}
              value={form.dailyStock[k]}
              onChange={(v) => updateStock(k, v)}
              min={0}
              max={10000}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Usuario shadow (pruebas)</h2>
        <p className="mt-1 text-sm text-muted">
          Carnet que puede probar la ruleta sin límites de temporada ni horario.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">MembershipId</span>
            <input
              type="text"
              value={form.shadowMembershipId}
              onChange={(e) =>
                update({ shadowMembershipId: e.target.value.toUpperCase() })
              }
              className="rounded-xl border border-border px-3 py-2 font-mono uppercase"
              placeholder="CY1000"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Probabilidad de premio shadow (0–1)
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min={0}
              max={1}
              value={form.shadowWinRate}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) update({ shadowWinRate: n });
              }}
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold">Consolación (rasca)</h2>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.consolationEnabled}
            onChange={(e) => update({ consolationEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span>Activar premio de consolación al perder todas las tiradas</span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Minutos para canjear el rasca"
            value={form.consolationWindowMin}
            onChange={(v) => update({ consolationWindowMin: v })}
            min={MIN_WINDOW_MIN}
            max={MAX_WINDOW_MIN}
            hint="En servidor se guarda en segundos (minutos × 60)."
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Texto visible al rascar
            </span>
            <input
              type="text"
              value={form.consolationRewardLabel}
              onChange={(e) =>
                update({ consolationRewardLabel: e.target.value })
              }
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar todo"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={saving || loading}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
        >
          Descartar y recargar
        </button>
      </div>
    </div>
  );
}

/**
 * Campo numérico con borrador en texto: evita que `Number("") === 0` fuerce
 * un cero al borrar para reescribir (p. ej. stock 8 → 10) y el “0” delante
 * al editar en inputs `type="number"` controlados.
 */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const lastExternal = useRef(value);

  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setDraft(String(value));
    }
  }, [value]);

  const commit = (raw: string) => {
    if (raw === "" || raw === "-") {
      const fallback = Math.min(max, Math.max(min, value));
      setDraft(String(fallback));
      onChange(fallback);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.floor(n)));
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          const t = e.target.value;
          if (t !== "" && !/^-?\d*$/.test(t)) return;
          setDraft(t);
          if (t === "" || t === "-") return;
          const n = Number(t);
          if (Number.isFinite(n)) {
            const clamped = Math.min(max, Math.max(min, Math.floor(n)));
            onChange(clamped);
            lastExternal.current = clamped;
          }
        }}
        onBlur={() => commit(draft)}
        className="rounded-xl border border-border px-3 py-2"
      />
      {hint ? (
        <span className="text-[11px] leading-snug text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
