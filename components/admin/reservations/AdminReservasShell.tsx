"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AdminReservationsBoard } from "@/components/admin/reservations/AdminReservationsBoard";
import { ReservationsPrevisionDialog } from "@/components/admin/reservations/ReservationsPrevisionDialog";

type Props = { canEditConfig: boolean };

function yearOptions(anchor: number): number[] {
  const out: number[] = [];
  for (let y = anchor + 1; y >= anchor - 12; y -= 1) {
    if (y >= 2000 && y <= 2100) out.push(y);
  }
  return out;
}

export function AdminReservasShell({ canEditConfig }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [boardYear, setBoardYear] = useState(() => new Date().getFullYear());
  const [previsionOpen, setPrevisionOpen] = useState(false);
  const yearChoices = useMemo(() => {
    const base = yearOptions(new Date().getFullYear());
    if (!base.includes(boardYear)) {
      return [...base, boardYear].sort((a, b) => b - a);
    }
    return base;
  }, [boardYear]);

  const onLoadingChange = useCallback((l: boolean) => {
    setLoading(l);
  }, []);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl box-border px-3 py-4 sm:px-4 sm:py-6 md:px-5 md:py-8">
      <div
        className="mb-4 flex min-w-0 flex-col gap-4 sm:mb-6 md:flex-row md:items-start md:justify-between
          md:gap-6"
      >
        <div className="min-w-0 flex-1">
          <Link
            href="/admin"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Volver
          </Link>
          <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold">Reservas</h1>
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="shrink-0 text-muted">Año</span>
              <select
                className="min-w-0 max-w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm font-medium"
                value={boardYear}
                onChange={(e) => setBoardYear(Number(e.target.value))}
                aria-label="Filtrar por año de la fecha de reserva"
              >
                {yearChoices.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1 min-w-0 text-sm text-muted">
            Tablero de reservas activas, chat con clientes y gestión del
            servicio. Listado y totales según el año de la fecha de reserva.
          </p>
        </div>
        <div
          className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:justify-end md:w-auto
            md:shrink-0 md:pt-1"
        >
          <button
            type="button"
            onClick={() => setPrevisionOpen(true)}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-muted/30"
          >
            Previsión
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
          {canEditConfig ? (
            <Link
              href="/admin/reservas/config"
              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-muted/30"
            >
              Configuración
            </Link>
          ) : null}
        </div>
      </div>
      <AdminReservationsBoard
        year={boardYear}
        refreshKey={refreshKey}
        onLoadingChange={onLoadingChange}
      />
      <ReservationsPrevisionDialog
        open={previsionOpen}
        onClose={() => setPrevisionOpen(false)}
      />
    </div>
  );
}
