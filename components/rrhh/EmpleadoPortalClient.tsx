"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QrScannerModal } from "@/components/admin/QrScannerModal";
import { addDays, formatLocalDate, getWeekdayKey } from "@/lib/datetime";

type Cell = {
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedEndsNextDay: boolean;
  actualStart: string | null;
  actualEnd: string | null;
  open: boolean;
  lateInMin: number | null;
  earlyOutMin: number | null;
  plannedMin: number;
  workedMin: number;
  hasIncident: boolean;
  incidentText: string | null;
  autoClosed: boolean;
  status:
    | "none"
    | "ok"
    | "absence"
    | "unplanned"
    | "open"
    | "issue"
    | "scheduled"
    | "pending";
  flags: {
    late: boolean;
    earlyIn: boolean;
    earlyOut: boolean;
    lateOut: boolean;
    overtime: boolean;
  };
};

type Worker = { userId: string; name: string };

type Data = {
  weekStart: string;
  weekEnd: string;
  jornadaStartHour: number;
  toleranceMin: number;
  workers: Worker[];
  days: string[];
  cells: Record<string, Record<string, Cell>>;
  weeklyTotals: Record<string, { plannedMin: number; workedMin: number }>;
};

type Props = { workerName: string };

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAY_ORDER: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

function mondayOf(dateStr: string): string {
  const wd = getWeekdayKey(dateStr);
  return addDays(dateStr, -WEEKDAY_ORDER[wd]);
}

function fmtHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

const STATUS_CELL: Record<Cell["status"], string> = {
  none: "border-dashed border-border",
  ok: "border-emerald-200 bg-emerald-50",
  issue: "border-amber-300 bg-amber-50",
  absence: "border-red-300 bg-red-50",
  unplanned: "border-sky-300 bg-sky-50",
  open: "border-brand/40 bg-brand/5",
  scheduled: "border-border",
  pending: "border-orange-300 bg-orange-50",
};

const AMBER = "bg-amber-100 text-amber-800";

function cellChips(c: Cell): { text: string; tone: string }[] {
  const chips: { text: string; tone: string }[] = [];
  if (c.status === "absence")
    return [{ text: "Falta", tone: "bg-red-100 text-red-700" }];
  if (c.status === "unplanned")
    return [{ text: "Sin turno", tone: "bg-sky-100 text-sky-700" }];
  if (c.status === "pending")
    return [{ text: "Sin fichar", tone: "bg-orange-100 text-orange-700" }];
  if (c.autoClosed)
    chips.push({ text: "Salida no gestionada", tone: "bg-red-100 text-red-700" });
  if (c.flags.late && c.lateInMin !== null)
    chips.push({ text: `+${c.lateInMin}′ tarde`, tone: AMBER });
  if (c.flags.earlyIn && c.lateInMin !== null)
    chips.push({ text: `${Math.abs(c.lateInMin)}′ antes (ent.)`, tone: AMBER });
  if (c.flags.earlyOut && c.earlyOutMin !== null)
    chips.push({ text: `−${c.earlyOutMin}′ antes`, tone: AMBER });
  if (c.flags.lateOut && c.earlyOutMin !== null)
    chips.push({ text: `+${Math.abs(c.earlyOutMin)}′ se pasó`, tone: AMBER });
  if (c.flags.overtime) chips.push({ text: "Exceso", tone: AMBER });
  if (c.open) chips.push({ text: "Abierto", tone: "bg-brand/15 text-brand" });
  if (chips.length === 0 && c.status === "ok")
    chips.push({ text: "✓", tone: "bg-emerald-100 text-emerald-700" });
  return chips;
}

/** Extrae el token `t` del texto del QR (URL `…/fichar?t=…`) o del texto crudo. */
function extractToken(raw: string): string | null {
  try {
    const u = new URL(raw);
    const t = u.searchParams.get("t");
    if (t) return t;
  } catch {
    // No es una URL absoluta; intentamos extraer el parámetro a mano.
  }
  const m = raw.match(/[?&]t=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

export function EmpleadoPortalClient({ workerName }: Props) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(formatLocalDate(new Date())),
  );
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return { date, label: DAY_LABELS[i], dayNum: Number(date.slice(8, 10)) };
      }),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/clock/week?week=${weekStart}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | (Data & { error?: string })
        | null;
      if (!res.ok || !json) {
        setError(json?.error ?? "No se pudieron cargar tus fichajes");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Error de red al cargar tus fichajes");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleScan = useCallback(
    (raw: string) => {
      const token = extractToken(raw);
      if (!token) {
        setScanError("El código escaneado no es un QR de fichaje válido.");
        return;
      }
      setScannerOpen(false);
      router.push(`/fichar?t=${encodeURIComponent(token)}`);
    },
    [router],
  );

  const worker = data?.workers[0] ?? null;
  const totals =
    worker && data ? data.weeklyTotals[worker.userId] : undefined;
  const rangeLabel = `${weekStart} → ${addDays(weekStart, 6)}`;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => {
          setScanError(null);
          setScannerOpen(true);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <QrIcon className="h-5 w-5" />
        Fichar
      </button>

      {scanError ? (
        <p className="text-sm text-red-600" role="alert">
          {scanError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
            aria-label="Semana anterior"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(formatLocalDate(new Date())))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
            aria-label="Semana siguiente"
          >
            →
          </button>
        </div>
        {totals ? (
          <span className="text-xs text-muted">
            <span className="font-medium text-foreground">
              {fmtHM(totals.workedMin)}
            </span>{" "}
            / {fmtHM(totals.plannedMin)}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted">{rangeLabel}</p>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted shadow-sm">
          Cargando…
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {days.map((d) => {
            const c = worker ? data?.cells[worker.userId]?.[d.date] : undefined;
            const status = c?.status ?? "none";
            const chips = c ? cellChips(c) : [];
            const hasContent = c && (c.plannedStart || c.actualStart);
            return (
              <div
                key={d.date}
                className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-sm ${STATUS_CELL[status]}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {d.label} {d.dayNum}
                  </span>
                  {c && hasContent ? (
                    <span className="text-xs text-muted">
                      {fmtHM(c.workedMin)} / {fmtHM(c.plannedMin)}
                    </span>
                  ) : null}
                </div>
                {hasContent ? (
                  <>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                      <span className="text-muted">
                        Turno:{" "}
                        {c!.plannedStart
                          ? `${c!.plannedStart}–${c!.plannedEnd}${
                              c!.plannedEndsNextDay ? "+1" : ""
                            }`
                          : "Sin turno"}
                      </span>
                      <span className="font-medium">
                        Fichado:{" "}
                        {c!.actualStart
                          ? `${c!.actualStart}–${c!.actualEnd ?? "…"}`
                          : "Sin fichaje"}
                      </span>
                    </div>
                    {chips.length > 0 || c!.hasIncident ? (
                      <div className="flex flex-wrap gap-1">
                        {chips.map((ch, i) => (
                          <span
                            key={i}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ch.tone}`}
                          >
                            {ch.text}
                          </span>
                        ))}
                        {c!.hasIncident ? (
                          <span
                            className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700"
                            title={c!.incidentText ?? "Incidencia"}
                          >
                            Incidencia
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {c!.hasIncident && c!.incidentText ? (
                      <p className="text-xs text-purple-700">{c!.incidentText}</p>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-muted">Sin actividad</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted">
        <Legend className="border-emerald-200 bg-emerald-50" label="OK" />
        <Legend className="border-amber-300 bg-amber-50" label="Desviación" />
        <Legend className="border-red-300 bg-red-50" label="Falta" />
        <Legend className="border-sky-300 bg-sky-50" label="Sin turno" />
        <Legend className="border-brand/40 bg-brand/5" label="Abierto" />
        <Legend className="border-orange-300 bg-orange-50" label="Sin fichar" />
      </div>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={handleScan}
        title="Escanear QR de fichaje"
        hint="Apunta la cámara al QR del terminal de fichaje"
      />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border ${className}`} />
      {label}
    </span>
  );
}

function QrIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M21 18v3h-3" />
    </svg>
  );
}
