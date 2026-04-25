"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminGetReservationsForecast,
  type AdminApiError,
  type AdminReservationsForecast,
} from "@/lib/admin-reservations/client";
import {
  formatRelativeDayTag,
  formatReservationDateLong,
} from "@/components/reservations/formatters";
import { addDays, DEFAULT_TIMEZONE, formatLocalDate } from "@/lib/datetime";
import type { ReservationStatus } from "@/types/models";

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pendientes",
  awaiting_customer: "Esperan cliente",
  awaiting_prepayment: "Esperan señal",
  confirmed: "Confirmadas",
  cancelled_by_customer: "Canc. cliente",
  cancelled_by_staff: "Canc. staff",
  no_show: "No show",
  completed: "Completadas",
};

type Props = {
  open: boolean;
  onClose: () => void;
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ReservationsPrevisionDialog({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminReservationsForecast | null>(null);
  const [forecastDay, setForecastDay] = useState(() =>
    formatLocalDate(new Date(), DEFAULT_TIMEZONE),
  );

  const todayStr = useMemo(
    () => formatLocalDate(new Date(), DEFAULT_TIMEZONE),
    [],
  );

  useEffect(() => {
    if (open) {
      setForecastDay(formatLocalDate(new Date(), DEFAULT_TIMEZONE));
    }
  }, [open]);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await adminGetReservationsForecast({ date: day });
      setData(d);
    } catch (e) {
      const err = e as AdminApiError;
      setError(err.message ?? "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(forecastDay);
  }, [open, forecastDay, load]);

  if (!open) return null;

  const relTag = formatRelativeDayTag(forecastDay, todayStr);
  const longDate = capitalize(formatReservationDateLong(forecastDay));

  return (
    <div
      className="fixed inset-0 z-[200] flex justify-center bg-black/50
        max-lg:items-stretch max-lg:p-0
        lg:items-center lg:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prevision-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full min-h-0 flex-col border border-border bg-card shadow-xl
          max-lg:h-full max-lg:max-h-[100dvh] max-lg:max-w-full max-lg:rounded-none
          lg:max-h-[min(90vh,720px)] lg:max-w-2xl lg:rounded-2xl"
      >
        <div
          className="shrink-0 border-b border-border px-4 py-4 sm:px-5
            max-lg:pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="prevision-title"
              className="text-lg font-semibold text-foreground"
            >
              Previsión de compra
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-lg font-bold leading-none text-rose-600 hover:bg-rose-50"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Día del resumen
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setForecastDay((d) => addDays(d, -1))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-lg font-semibold hover:bg-muted/40"
                aria-label="Día anterior"
              >
                ‹
              </button>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-base font-semibold leading-snug text-foreground sm:text-lg">
                  {longDate}
                </p>
                <p className="text-sm text-brand">
                  <span className="font-medium">({relTag})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForecastDay((d) => addDays(d, 1))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-lg font-semibold hover:bg-muted/40"
                aria-label="Día siguiente"
              >
                ›
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Reservas con fecha de servicio en este día, estados:{" "}
              {data?.statusScope
                .map((s) => STATUS_LABEL[s] ?? s)
                .join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Sin datos personales: solo comensales, menús y platos.
            </p>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {loading ? (
            <p className="text-sm text-muted">Calculando…</p>
          ) : error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : data ? (
            <div className="space-y-6">
              <section
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                aria-label="Resumen"
              >
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Reservas
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.reservationCount}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Comensales
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.totalComensales}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-border bg-muted/20 px-3 py-2 sm:col-span-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Tipos de menú
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.distinctMenuTypes}
                  </p>
                </div>
                {(data.reservasSinMenuDetallado > 0 ||
                  data.comensalesSinMenuDetallado > 0) && (
                  <div className="col-span-2 sm:col-span-3">
                    <p
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                      role="status"
                    >
                      {data.reservasSinMenuDetallado} reserva
                      {data.reservasSinMenuDetallado === 1 ? "" : "s"} sin
                      desglose de menú ({data.comensalesSinMenuDetallado}{" "}
                      comensales). Revisad el detalle en cada reserva.
                    </p>
                  </div>
                )}
              </section>

              {data.byMenu.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Raciones por tipo de menú
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/30 text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Menú</th>
                          <th className="w-20 px-3 py-2 text-right font-medium">
                            Raciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byMenu.map((row) => (
                          <tr
                            key={row.offerId}
                            className="border-t border-border/80"
                          >
                            <td className="px-3 py-2">{row.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {data.byPrincipal.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Principales pedidos
                  </h3>
                  <p className="mb-2 text-xs text-muted">
                    Cada ración con menú y principal elegido cuenta como una
                    unidad.
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/30 text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Plato</th>
                          <th className="w-20 px-3 py-2 text-right font-medium">
                            Nº
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byPrincipal.map((row) => (
                          <tr
                            key={row.key}
                            className="border-t border-border/80"
                          >
                            <td className="px-3 py-2">{row.displayName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : data.byMenu.length > 0 ? (
                <p className="text-sm text-muted">
                  No hay principales anotados en las líneas de menú.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border
            max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]
            px-4 py-3 sm:px-5"
        >
          <button
            type="button"
            onClick={() => void load(forecastDay)}
            disabled={loading}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-muted/30 disabled:opacity-50"
          >
            Recalcular
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
