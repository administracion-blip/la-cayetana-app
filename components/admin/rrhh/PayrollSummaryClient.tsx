"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, formatLocalDate } from "@/lib/datetime";

type DayRow = { date: string; minutes: number };
type WorkerRow = {
  userId: string;
  name: string;
  dni: string;
  iban: string;
  days: DayRow[];
  totalMin: number;
};
type Data = { from: string; to: string; workers: WorkerRow[] };

function fmtHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

/** Horas en decimal para nómina (8h 30m → 8.5). Redondeo a 2 decimales. */
function toDecimalHours(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

export function PayrollSummaryClient() {
  const today = formatLocalDate(new Date());
  const [from, setFrom] = useState(() => addDays(today, -30));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/rrhh/payroll-summary?from=${from}&to=${to}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | (Data & { error?: string })
        | null;
      if (!res.ok || !json) {
        setError(json?.error ?? "No se pudo generar el resumen");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Error de red al generar el resumen");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const rangeLabel = data ? `${data.from} → ${data.to}` : `${from} → ${to}`;
  const hasRows = Boolean(data && data.workers.some((w) => w.totalMin > 0));

  async function downloadExcel() {
    if (!data) return;
    setMenuOpen(false);
    const XLSX = await import("xlsx");
    const rows = data.workers
      .filter((w) => w.totalMin > 0)
      .map((w) => ({
        Trabajador: w.name,
        DNI: w.dni,
        IBAN: w.iban,
        Horas: toDecimalHours(w.totalMin),
      }));
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ["Trabajador", "DNI", "IBAN", "Horas"],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen jornadas");
    XLSX.writeFile(wb, `resumen-jornadas_${data.from}_${data.to}.xlsx`);
  }

  async function downloadPdf() {
    if (!data) return;
    setMenuOpen(false);
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 14;
    let y = 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Resumen de jornadas", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y += 7;
    doc.text(`Periodo: ${data.from} → ${data.to}`, margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Trabajador", "DNI", "IBAN", "Total"]],
      body: data.workers
        .filter((w) => w.totalMin > 0)
        .map((w) => [w.name, w.dni, w.iban, fmtHM(w.totalMin)]),
      styles: { fontSize: 9, cellPadding: 2.2 },
      headStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40] },
      columnStyles: { 3: { halign: "right", cellWidth: 28 } },
    });

    doc.save(`resumen-jornadas_${data.from}_${data.to}.pdf`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-medium text-muted">Desde</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-brand focus:ring-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-medium text-muted">Hasta</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-brand focus:ring-2"
            />
          </label>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            disabled={!hasRows}
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            Descargas ▾
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <button
                type="button"
                onClick={() => void downloadPdf()}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                Descargar PDF
              </button>
              <button
                type="button"
                onClick={() => void downloadExcel()}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                Descargar Excel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted">{rangeLabel}</p>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted shadow-sm">
          Generando resumen…
        </p>
      ) : !hasRows ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted shadow-sm">
          Sin horas fichadas en este periodo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-medium">Trabajador</th>
                <th className="px-4 py-3 font-medium">DNI</th>
                <th className="px-4 py-3 font-medium">IBAN</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data!.workers
                .filter((w) => w.totalMin > 0)
                .map((w) => (
                  <tr key={w.userId} className="border-b border-border/60">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">
                      {w.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">
                      {w.dni}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">
                      {w.iban}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {fmtHM(w.totalMin)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
