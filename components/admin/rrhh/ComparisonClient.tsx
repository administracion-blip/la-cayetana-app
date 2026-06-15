"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, formatLocalDate, getWeekdayKey } from "@/lib/datetime";

type Worker = { userId: string; name: string };

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
  shifts: {
    shiftId?: string | null;
    start: string;
    end: string;
    endsNextDay: boolean;
    note?: string | null;
  }[];
  clocks: {
    clockInAt: string;
    clockOutAt?: string | null;
    outComment?: string | null;
    autoClosed?: boolean | null;
  }[];
};

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

type Props = { canManage: boolean };

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

/** Formatea una desviación en minutos como "1h 30m" / "45m" (sin signo). */
function fmtMin(min: number): string {
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
    chips.push({ text: `+${fmtMin(c.lateInMin)} tarde`, tone: AMBER });
  if (c.flags.earlyIn && c.lateInMin !== null)
    chips.push({ text: `${fmtMin(c.lateInMin)} antes (ent.)`, tone: AMBER });
  if (c.flags.earlyOut && c.earlyOutMin !== null)
    chips.push({ text: `−${fmtMin(c.earlyOutMin)} antes`, tone: AMBER });
  if (c.flags.lateOut && c.earlyOutMin !== null)
    chips.push({ text: `+${fmtMin(c.earlyOutMin)} se pasó`, tone: AMBER });
  if (c.flags.overtime) chips.push({ text: "Exceso", tone: AMBER });
  if (c.open) chips.push({ text: "Abierto", tone: "bg-brand/15 text-brand" });
  if (chips.length === 0 && c.status === "ok")
    chips.push({ text: "✓", tone: "bg-emerald-100 text-emerald-700" });
  return chips;
}

export function ComparisonClient({ canManage }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(formatLocalDate(new Date())),
  );
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailDay, setDetailDay] = useState<string | null>(null);

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
      const res = await fetch(`/api/admin/rrhh/comparison?week=${weekStart}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | (Data & { error?: string })
        | null;
      if (!res.ok || !json) {
        setError(json?.error ?? "No se pudo cargar la comparativa");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Error de red al cargar la comparativa");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const incidents = useMemo(() => buildIncidents(data, days), [data, days]);

  const rangeLabel = `${weekStart} → ${addDays(weekStart, 6)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            ← Semana
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
          >
            Semana →
          </button>
          <span className="ml-2 text-sm text-muted">{rangeLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {data ? (
            <span className="text-xs text-muted">
              Corte de jornada {data.jornadaStartHour}:00 · tolerancia{" "}
              {data.toleranceMin} min
            </span>
          ) : null}
          {canManage ? (
            <a
              href="/admin/rrhh/configuracion"
              className="text-xs text-brand hover:underline"
            >
              Configuración
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium">
                Trabajador
              </th>
              {days.map((d) => (
                <th key={d.date} className="px-2 py-3 text-center font-medium">
                  <button
                    type="button"
                    onClick={() => setDetailDay(d.date)}
                    className="hover:text-brand"
                    title="Ver detalle del día"
                  >
                    <div>{d.label}</div>
                    <div className="text-xs text-muted">{d.dayNum}</div>
                  </button>
                </th>
              ))}
              <th className="px-3 py-3 text-center font-medium">Horas</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted">
                  Cargando…
                </td>
              </tr>
            ) : !data || data.workers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted">
                  No hay trabajadores dados de alta.
                </td>
              </tr>
            ) : (
              data.workers.map((w) => {
                const totals = data.weeklyTotals[w.userId] ?? {
                  plannedMin: 0,
                  workedMin: 0,
                };
                return (
                  <tr
                    key={w.userId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-3 font-medium">
                      {w.name}
                    </td>
                    {days.map((d) => {
                      const c = data.cells[w.userId]?.[d.date];
                      const status = c?.status ?? "none";
                      const chips = c ? cellChips(c) : [];
                      return (
                        <td key={d.date} className="px-1.5 py-1.5 align-top">
                          <div
                            className={`flex min-h-[58px] flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-xs ${STATUS_CELL[status]}`}
                          >
                            {c && (c.plannedStart || c.actualStart) ? (
                              <>
                                <span className="text-muted">
                                  {c.plannedStart
                                    ? `${c.plannedStart}–${c.plannedEnd}${
                                        c.plannedEndsNextDay ? "+1" : ""
                                      }`
                                    : "Sin turno"}
                                </span>
                                <span className="font-medium">
                                  {c.actualStart
                                    ? `${c.actualStart}–${c.actualEnd ?? "…"}`
                                    : "Sin fichaje"}
                                </span>
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {chips.map((ch, i) => (
                                    <span
                                      key={i}
                                      className={`rounded px-1 py-0.5 text-[10px] font-medium ${ch.tone}`}
                                    >
                                      {ch.text}
                                    </span>
                                  ))}
                                  {c.hasIncident ? (
                                    <span
                                      className="rounded bg-purple-100 px-1 py-0.5 text-[10px] font-medium text-purple-700"
                                      title={c.incidentText ?? "Incidencia"}
                                    >
                                      Incidencia
                                    </span>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-3 text-center text-xs">
                      <span className="font-medium">{fmtHM(totals.workedMin)}</span>
                      <span className="text-muted"> / {fmtHM(totals.plannedMin)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <Legend className="border-emerald-200 bg-emerald-50" label="OK" />
        <Legend className="border-amber-300 bg-amber-50" label="Desviación (tarde/antes/exceso)" />
        <Legend className="border-red-300 bg-red-50" label="Falta" />
        <Legend className="border-sky-300 bg-sky-50" label="Sin turno" />
        <Legend className="border-brand/40 bg-brand/5" label="Turno abierto" />
        <Legend className="border-orange-300 bg-orange-50" label="Sin fichar" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">
          Incidencias de la semana
          {incidents.length > 0 ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {incidents.length}
            </span>
          ) : null}
        </h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted">Sin incidencias en esta semana.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {incidents.map((it, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${it.tone}`}>
                  {it.type}
                </span>
                <span className="font-medium">{it.worker}</span>
                <span className="text-muted">{it.dayLabel}</span>
                <span className="text-muted">{it.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailDay && data ? (
        <DayDetail
          day={detailDay}
          data={data}
          canManage={canManage}
          onValidated={load}
          onClose={() => setDetailDay(null)}
        />
      ) : null}
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

function statusLabel(c: Cell): string {
  switch (c.status) {
    case "ok":
      return "OK";
    case "absence":
      return "Falta";
    case "unplanned":
      return "Sin turno";
    case "open":
      return "Abierto";
    case "pending":
      return "Sin fichar";
    case "scheduled":
      return "Programado";
    case "issue": {
      const parts: string[] = [];
      if (c.autoClosed) parts.push("Salida no gestionada");
      if (c.flags.late) parts.push("Entró tarde");
      if (c.flags.earlyIn) parts.push("Entró antes");
      if (c.flags.earlyOut) parts.push("Salió antes");
      if (c.flags.lateOut) parts.push("Se pasó");
      if (c.flags.overtime) parts.push("Exceso");
      return parts.join(", ") || "Desviación";
    }
    default:
      return "—";
  }
}

type Incident = {
  worker: string;
  dayLabel: string;
  type: string;
  detail: string;
  tone: string;
};

const RED = "bg-red-100 text-red-700";
const AMBER_INC = "bg-amber-100 text-amber-800";

function buildIncidents(
  data: Data | null,
  days: { date: string; label: string; dayNum: number }[],
): Incident[] {
  if (!data) return [];
  const out: Incident[] = [];
  for (const w of data.workers) {
    for (const d of days) {
      const c = data.cells[w.userId]?.[d.date];
      if (!c) continue;
      const dayLabel = `${d.label} ${d.dayNum}`;
      const push = (type: string, detail: string, tone: string) =>
        out.push({ worker: w.name, dayLabel, type, detail, tone });

      if (c.status === "pending")
        push("Sin fichar", "Tiene turno y aún no ha fichado", RED);
      if (c.status === "absence")
        push("Falta", "Turno planificado sin ningún fichaje", RED);
      if (c.autoClosed)
        push("Salida no gestionada", "Cierre automático a la hora límite", RED);
      if (c.flags.earlyIn && c.lateInMin !== null)
        push("Fichaje antes de tiempo", `Entró ${fmtMin(c.lateInMin)} antes`, AMBER_INC);
      if (c.flags.late && c.lateInMin !== null)
        push("Entrada tarde", `Entró ${fmtMin(c.lateInMin)} tarde`, AMBER_INC);
      if (c.flags.earlyOut && c.earlyOutMin !== null)
        push("Salida antes", `Salió ${fmtMin(c.earlyOutMin)} antes`, AMBER_INC);
      if (c.flags.lateOut && c.earlyOutMin !== null)
        push("Pasado de fichaje", `Salió ${fmtMin(c.earlyOutMin)} después`, AMBER_INC);
      if (c.flags.overtime)
        push("Exceso de horas", `${fmtHM(c.workedMin)} vs ${fmtHM(c.plannedMin)} previstas`, AMBER_INC);
      if (c.status === "unplanned")
        push("Fichaje sin turno", "Fichó sin turno planificado", "bg-sky-100 text-sky-700");
      if (c.hasIncident && c.incidentText)
        push("Incidencia", c.incidentText, "bg-purple-100 text-purple-700");
    }
  }
  return out;
}

/**
 * Determina si una celda permite "validar el fichaje" (ajustar el cuadrante a
 * lo realmente fichado). Solo en casos inequívocos: 1 fichaje cerrado y, o bien
 * 1 turno con desviación (ajustar), o ningún turno (crear).
 */
function validationFor(
  c: Cell,
): { mode: "adjust"; shiftId: string } | { mode: "create" } | null {
  if (!c.actualStart || !c.actualEnd || c.open) return null;
  if (c.clocks.length !== 1) return null;
  if (c.shifts.length === 0) {
    if (c.status === "unplanned") return { mode: "create" };
    return null;
  }
  if (c.shifts.length === 1 && c.status === "issue") {
    const shiftId = c.shifts[0]?.shiftId;
    if (shiftId) return { mode: "adjust", shiftId };
  }
  return null;
}

function DayDetail({
  day,
  data,
  canManage,
  onValidated,
  onClose,
}: {
  day: string;
  data: Data;
  canManage: boolean;
  onValidated: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = data.workers
    .map((w) => ({ worker: w, cell: data.cells[w.userId]?.[day] }))
    .filter((r) => r.cell && r.cell.status !== "none");

  async function validate(userId: string, c: Cell) {
    const v = validationFor(c);
    if (!v || !c.actualStart || !c.actualEnd) return;
    setBusy(userId);
    setError(null);
    try {
      let res: Response;
      if (v.mode === "adjust") {
        res = await fetch(
          `/api/admin/rrhh/shifts/${encodeURIComponent(v.shiftId)}?userId=${encodeURIComponent(userId)}&jornadaDate=${encodeURIComponent(day)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start: c.actualStart,
              end: c.actualEnd,
              note: c.shifts[0]?.note ?? undefined,
            }),
          },
        );
      } else {
        res = await fetch("/api/admin/rrhh/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            jornadaDate: day,
            start: c.actualStart,
            end: c.actualEnd,
          }),
        });
      }
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "No se pudo validar el fichaje");
        return;
      }
      setConfirming(null);
      await onValidated();
    } catch {
      setError("Error de red al validar el fichaje");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Detalle de la jornada {day}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-sm hover:bg-background"
          >
            Cerrar
          </button>
        </div>
        {error ? (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            Sin turnos ni fichajes en esta jornada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Trabajador</th>
                  <th className="px-3 py-2 font-medium">Planificado</th>
                  <th className="px-3 py-2 font-medium">Fichado</th>
                  <th className="px-3 py-2 font-medium">Δ ent.</th>
                  <th className="px-3 py-2 font-medium">Δ sal.</th>
                  <th className="px-3 py-2 font-medium">Horas</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  {canManage ? (
                    <th className="px-3 py-2 font-medium">Acción</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ worker, cell }) => {
                  const c = cell as Cell;
                  const v = canManage ? validationFor(c) : null;
                  return (
                    <tr
                      key={worker.userId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">{worker.name}</td>
                      <td className="px-3 py-2 text-muted">
                        {c.plannedStart
                          ? `${c.plannedStart}–${c.plannedEnd}${
                              c.plannedEndsNextDay ? "+1" : ""
                            }`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {c.actualStart
                          ? `${c.actualStart}–${c.actualEnd ?? "…"}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {c.lateInMin === null
                          ? "—"
                          : `${c.lateInMin > 0 ? "+" : c.lateInMin < 0 ? "−" : ""}${fmtMin(c.lateInMin)}`}
                      </td>
                      <td className="px-3 py-2">
                        {c.earlyOutMin === null
                          ? "—"
                          : `${c.earlyOutMin > 0 ? "−" : "+"}${fmtMin(c.earlyOutMin)}`}
                      </td>
                      <td className="px-3 py-2">
                        {fmtHM(c.workedMin)}
                        <span className="text-muted"> / {fmtHM(c.plannedMin)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{statusLabel(c)}</span>
                        {c.hasIncident && c.incidentText ? (
                          <div className="mt-0.5 text-xs text-purple-700">
                            {c.incidentText}
                          </div>
                        ) : null}
                      </td>
                      {canManage ? (
                        <td className="px-3 py-2">
                          {v ? (
                            confirming === worker.userId ? (
                              <span className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy === worker.userId}
                                  onClick={() => void validate(worker.userId, c)}
                                  className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                  title={`Ajustar a ${c.actualStart}–${c.actualEnd}`}
                                >
                                  {busy === worker.userId ? "…" : "Confirmar"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy === worker.userId}
                                  onClick={() => setConfirming(null)}
                                  className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-background disabled:opacity-60"
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setError(null);
                                  setConfirming(worker.userId);
                                }}
                                className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                {v.mode === "create"
                                  ? "Crear turno"
                                  : "Validar fichaje"}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
