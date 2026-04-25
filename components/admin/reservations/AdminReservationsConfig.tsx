"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminGetPrepaymentConfig,
  adminGetSlotsConfig,
  adminPutPrepaymentConfig,
  adminPutSlotsConfig,
  type AdminApiError,
} from "@/lib/admin-reservations/client";
import type {
  AdminPrepaymentConfigDto,
  AdminSlotsConfigDto,
} from "@/lib/serialization/reservations";
import type {
  ReservationSlotDay,
  ReservationSlotWindow,
  ReservationWeekdayKey,
} from "@/types/models";

const WEEKDAYS: { key: ReservationWeekdayKey; label: string }[] = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

export function AdminReservationsConfig({ canEdit }: { canEdit: boolean }) {
  const [slots, setSlots] = useState<AdminSlotsConfigDto | null>(null);
  const [prepay, setPrepay] = useState<AdminPrepaymentConfigDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSlots, setSavingSlots] = useState(false);
  const [savingPrepay, setSavingPrepay] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 3000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([
        adminGetSlotsConfig(),
        adminGetPrepaymentConfig(),
      ]);
      setSlots(a.config);
      setPrepay(b.config);
    } catch (err) {
      const apiErr = err as AdminApiError;
      setError(apiErr?.message ?? "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSlots = async () => {
    if (!slots) return;
    setSavingSlots(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await adminPutSlotsConfig(slots);
      setSlots(res.config);
      setStatusMsg("Slots guardados correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingSlots(false);
    }
  };

  const savePrepay = async () => {
    if (!prepay) return;
    setSavingPrepay(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await adminPutPrepaymentConfig(prepay);
      setPrepay(res.config);
      setStatusMsg("Prepago guardado correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingPrepay(false);
    }
  };

  if (loading) return <p className="text-sm text-muted">Cargando…</p>;
  if (error && !slots) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {error}
      </div>
    );
  }
  if (!slots || !prepay) return null;

  return (
    <div className="space-y-6">
      {statusMsg ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg animate-in fade-in slide-in-from-top-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-emerald-600"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.59a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.793 2.793 6.793-6.876a1 1 0 0 1 1.414-.013Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{statusMsg}</span>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Slots y ventanas</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Reserva Anticipación mínima (min)"
            value={slots.advanceMinMinutes}
            disabled={!canEdit}
            onChange={(v) =>
              setSlots({ ...slots, advanceMinMinutes: v })
            }
          />
          <NumberField
            label="Máximo de días a futuro"
            value={slots.advanceMaxDays}
            disabled={!canEdit}
            onChange={(v) => setSlots({ ...slots, advanceMaxDays: v })}
          />
          <NumberField
            label="Mínimo comensales"
            value={slots.minPartySize}
            disabled={!canEdit}
            onChange={(v) => setSlots({ ...slots, minPartySize: v })}
          />
          <NumberField
            label="Máximo comensales"
            value={slots.maxPartySize}
            disabled={!canEdit}
            onChange={(v) => setSlots({ ...slots, maxPartySize: v })}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Rango: reservas desde (opcional)
            </span>
            <input
              type="date"
              value={slots.bookableFromDate}
              disabled={!canEdit}
              onChange={(e) =>
                setSlots({ ...slots, bookableFromDate: e.target.value })
              }
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">
              Rango: reservas hasta (opcional)
            </span>
            <input
              type="date"
              value={slots.bookableUntilDate}
              disabled={!canEdit}
              onChange={(e) =>
                setSlots({ ...slots, bookableUntilDate: e.target.value })
              }
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">
          Si rellenas una o ambas, el cliente solo podrá elegir fechas en ese
          tramo, cruzado con el máximo de días a futuro y la anticipación
          mínima. Deja vacío para no fijar límite en ese extremo. El personal
          puede seguir moviendo reservas fuera del rango desde el backoffice.
        </p>

        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold">Horario por día de semana</h3>
          {WEEKDAYS.map(({ key, label }) => {
            const day = slots.byWeekday[key] ?? { windows: [] };
            return (
              <WeekdayEditor
                key={key}
                label={label}
                day={day}
                disabled={!canEdit}
                onChange={(newDay) =>
                  setSlots({
                    ...slots,
                    byWeekday: { ...slots.byWeekday, [key]: newDay },
                  })
                }
              />
            );
          })}
        </div>

        {canEdit ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={saveSlots}
              disabled={savingSlots}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {savingSlots ? "Guardando…" : "Guardar slots"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Prepago / señal</h2>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prepay.enabled}
            disabled={!canEdit}
            onChange={(e) => setPrepay({ ...prepay, enabled: e.target.checked })}
          />
          Exigir señal para grupos grandes
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <NumberField
            label="A partir de X comensales"
            value={prepay.minPartySize}
            disabled={!canEdit}
            onChange={(v) => setPrepay({ ...prepay, minPartySize: v })}
          />
          <EuroField
            label="Importe por persona (€)"
            cents={prepay.amountPerPersonCents}
            disabled={!canEdit}
            onChange={(cents) =>
              setPrepay({ ...prepay, amountPerPersonCents: cents })
            }
          />
          <NumberField
            label="Plazo (horas)"
            value={prepay.deadlineHours}
            disabled={!canEdit}
            onChange={(v) => setPrepay({ ...prepay, deadlineHours: v })}
          />
        </div>

        <label className="mt-3 block text-xs font-medium text-muted">
          Plantilla de instrucciones (admite placeholders{" "}
          <code className="rounded bg-muted/40 px-1">{"{{amount}}"}</code>,{" "}
          <code className="rounded bg-muted/40 px-1">{"{{deadline}}"}</code>,{" "}
          <code className="rounded bg-muted/40 px-1">
            {"{{reservationDate}}"}
          </code>
          , <code className="rounded bg-muted/40 px-1">{"{{reservationTime}}"}</code>
          , <code className="rounded bg-muted/40 px-1">{"{{partySize}}"}</code>
          , <code className="rounded bg-muted/40 px-1">{"{{reservationId}}"}</code>
          ,{" "}
          <code className="rounded bg-muted/40 px-1">
            {"{{prepaymentConcept}}"}
          </code>
          , <code className="rounded bg-muted/40 px-1">{"{{customerName}}"}</code>
          )
        </label>
        <textarea
          rows={6}
          value={prepay.instructionsTemplate}
          disabled={!canEdit}
          onChange={(e) =>
            setPrepay({ ...prepay, instructionsTemplate: e.target.value })
          }
          className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm font-mono"
        />

        {canEdit ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={savePrepay}
              disabled={savingPrepay}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {savingPrepay ? "Guardando…" : "Guardar prepago"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="rounded-xl border border-border px-3 py-2"
      />
    </label>
  );
}

/**
 * Campo de importe en euros. Internamente se guarda en céntimos (para
 * evitar errores de coma flotante) pero el usuario introduce y ve euros
 * con 2 decimales. La conversión se hace con `Math.round(v * 100)` para
 * acortar derivas de precisión como `1.23 * 100 = 122.99999…`.
 */
function EuroField({
  label,
  cents,
  onChange,
  disabled,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string>(() => (cents / 100).toFixed(2));

  useEffect(() => {
    setDraft((cents / 100).toFixed(2));
  }, [cents]);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = Number(draft.replace(",", "."));
          if (!Number.isFinite(parsed) || parsed < 0) {
            setDraft((cents / 100).toFixed(2));
            return;
          }
          const nextCents = Math.round(parsed * 100);
          onChange(nextCents);
          setDraft((nextCents / 100).toFixed(2));
        }}
        className="rounded-xl border border-border px-3 py-2"
      />
    </label>
  );
}

function WeekdayEditor({
  label,
  day,
  disabled,
  onChange,
}: {
  label: string;
  day: ReservationSlotDay;
  disabled?: boolean;
  onChange: (day: ReservationSlotDay) => void;
}) {
  const addWindow = () => {
    const w: ReservationSlotWindow = {
      from: "13:00",
      to: "16:00",
      stepMinutes: 30,
      capacity: 60,
    };
    onChange({ windows: [...day.windows, w] });
  };
  const updateWindow = (idx: number, patch: Partial<ReservationSlotWindow>) => {
    const windows = day.windows.map((w, i) =>
      i === idx ? { ...w, ...patch } : w,
    );
    onChange({ windows });
  };
  const removeWindow = (idx: number) => {
    onChange({ windows: day.windows.filter((_, i) => i !== idx) });
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {disabled ? null : day.windows.length === 0 ? (
          <button
            type="button"
            onClick={addWindow}
            className="text-xs font-medium text-brand underline"
          >
            + Añadir franja
          </button>
        ) : (
          <button
            type="button"
            onClick={addWindow}
            className="text-xs font-medium text-brand underline"
          >
            + Otra franja
          </button>
        )}
      </div>
      {day.windows.length === 0 ? (
        <p className="text-xs text-muted">Cerrado.</p>
      ) : (
        <ul className="space-y-2">
          {day.windows.map((w, idx) => (
            <li
              key={idx}
              className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2 text-xs"
            >
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Desde</span>
                <input
                  type="time"
                  value={w.from}
                  disabled={disabled}
                  onChange={(e) =>
                    updateWindow(idx, { from: e.target.value })
                  }
                  className="rounded-lg border border-border px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Hasta</span>
                <input
                  type="time"
                  value={w.to}
                  disabled={disabled}
                  onChange={(e) => updateWindow(idx, { to: e.target.value })}
                  className="rounded-lg border border-border px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Paso (min)</span>
                <input
                  type="number"
                  value={w.stepMinutes}
                  disabled={disabled}
                  onChange={(e) =>
                    updateWindow(idx, { stepMinutes: Number(e.target.value) })
                  }
                  className="rounded-lg border border-border px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Capacidad</span>
                <input
                  type="number"
                  value={w.capacity}
                  disabled={disabled}
                  onChange={(e) =>
                    updateWindow(idx, { capacity: Number(e.target.value) })
                  }
                  className="rounded-lg border border-border px-2 py-1"
                />
              </label>
              {disabled ? null : (
                <button
                  type="button"
                  onClick={() => removeWindow(idx)}
                  className="mb-1 text-xs font-medium text-rose-700 underline"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
