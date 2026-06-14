"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatLocalDate, getWeekdayKey, parseHhMm } from "@/lib/datetime";
import { badgeClassForColor } from "@/lib/rrhh/positions";
import { PositionBadge } from "./PositionBadge";

type Worker = {
  userId: string;
  name: string;
  position: string | null;
  positionColor: string | null;
};
type Shift = {
  shiftId: string;
  userId: string;
  jornadaDate: string;
  start: string;
  end: string;
  endsNextDay: boolean;
  note: string | null;
};
type WeekData = {
  weekStart: string;
  weekEnd: string;
  jornadaStartHour: number;
  workers: Worker[];
  shifts: Shift[];
};

type DayRow = { userId: string; name: string; shifts: Shift[] };
type DayGroup = { position: string; color: string | null; rows: DayRow[] };

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

function fmtHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const SHIFT_DRAG_TYPE = "application/x-rrhh-shift";

type DropTarget = { userId: string; date: string };

function shiftDropZoneProps(
  canManage: boolean,
  target: DropTarget,
  dropTarget: DropTarget | null,
  setDropTarget: (t: DropTarget | null) => void,
  onCopy: (shift: Shift, userId: string, date: string) => void,
): {
  isOver: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
} {
  const isOver =
    dropTarget?.userId === target.userId && dropTarget?.date === target.date;
  if (!canManage) return { isOver: false };
  return {
    isOver,
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropTarget(target);
    },
    onDrop: (e) => {
      e.preventDefault();
      setDropTarget(null);
      try {
        const raw = e.dataTransfer.getData(SHIFT_DRAG_TYPE);
        if (!raw) return;
        const shift = JSON.parse(raw) as Shift;
        void onCopy(shift, target.userId, target.date);
      } catch {
        /* payload inválido */
      }
    },
  };
}

function DayShifts({
  shifts,
  canManage,
  onAdd,
  onEdit,
  onRemove,
  onDragEnd,
}: {
  shifts: Shift[];
  canManage: boolean;
  onAdd?: () => void;
  onEdit?: (s: Shift) => void;
  onRemove: (s: Shift) => void;
  onDragEnd?: () => void;
}) {
  const skipClickRef = useRef(false);

  return (
    <div className="flex flex-col gap-0.5">
      {shifts.map((s) => (
        <div
          key={s.shiftId}
          draggable={canManage}
          className={`rounded border border-brand/30 bg-brand/5 px-1 py-0.5 ${
            canManage
              ? "cursor-grab hover:bg-brand/10 active:cursor-grabbing"
              : ""
          }`}
          title={
            s.note
              ? `${s.note} · Clic para editar · Arrastra para copiar`
              : canManage
                ? "Clic para editar · Arrastra para copiar"
                : undefined
          }
          onDragStart={
            canManage
              ? (e) => {
                  skipClickRef.current = true;
                  e.dataTransfer.setData(SHIFT_DRAG_TYPE, JSON.stringify(s));
                  e.dataTransfer.effectAllowed = "copy";
                }
              : undefined
          }
          onDragEnd={
            canManage
              ? () => {
                  onDragEnd?.();
                  window.setTimeout(() => {
                    skipClickRef.current = false;
                  }, 100);
                }
              : undefined
          }
          onClick={
            canManage && onEdit
              ? () => {
                  if (skipClickRef.current) return;
                  onEdit(s);
                }
              : undefined
          }
          onKeyDown={
            canManage && onEdit
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(s);
                  }
                }
              : undefined
          }
          role={canManage && onEdit ? "button" : undefined}
          tabIndex={canManage && onEdit ? 0 : undefined}
        >
          <div className="flex items-center justify-between gap-0.5">
            <span className="min-w-0 truncate text-[10px] font-medium leading-tight">
              {s.start}–{s.end}
              {s.endsNextDay ? <span className="text-muted"> +1</span> : null}
            </span>
            {canManage ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(s);
                }}
                aria-label="Borrar turno"
                className="shrink-0 text-[10px] text-red-600 hover:text-red-700"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {canManage && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          title="Añadir turno"
          className="rounded border border-dashed border-border px-1 py-0.5 text-[10px] text-muted hover:border-brand/50 hover:text-foreground"
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export function CuadrantesClient({ canManage }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(formatLocalDate(new Date())),
  );
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [shiftModal, setShiftModal] = useState<
    | { mode: "add"; userId: string; date: string }
    | { mode: "edit"; shift: Shift }
    | null
  >(null);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [datePick, setDatePick] = useState(weekStart);
  const [cutoff, setCutoff] = useState<number>(6);
  const [view, setView] = useState<"week" | "day">("week");
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    formatLocalDate(new Date()),
  );
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [copying, setCopying] = useState(false);

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
      const res = await fetch(`/api/admin/rrhh/shifts?week=${weekStart}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | (WeekData & { error?: string })
        | null;
      if (!res.ok || !json) {
        setError(json?.error ?? "No se pudieron cargar los turnos");
        setData(null);
        return;
      }
      setData(json);
      setCutoff(json.jornadaStartHour);
    } catch {
      setError("Error de red al cargar los turnos");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const goToWeek = useCallback((monday: string) => {
    setWeekStart(monday);
    setDatePick(monday);
  }, []);

  // Mantén el día seleccionado dentro de la semana visible.
  useEffect(() => {
    const end = addDays(weekStart, 6);
    if (selectedDay < weekStart || selectedDay > end) {
      const today = formatLocalDate(new Date());
      setSelectedDay(today >= weekStart && today <= end ? today : weekStart);
    }
  }, [weekStart, selectedDay]);

  const shiftsByCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of data?.shifts ?? []) {
      const key = `${s.userId}|${s.jornadaDate}`;
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [data]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    if (!data) return [];
    const workerById = new Map(data.workers.map((w) => [w.userId, w]));
    const groups = new Map<
      string,
      { position: string; color: string | null; rows: Map<string, DayRow> }
    >();
    for (const s of data.shifts) {
      if (s.jornadaDate !== selectedDay) continue;
      const w = workerById.get(s.userId);
      const position = w?.position ?? "Sin puesto";
      let g = groups.get(position);
      if (!g) {
        g = { position, color: w?.positionColor ?? null, rows: new Map() };
        groups.set(position, g);
      }
      let r = g.rows.get(s.userId);
      if (!r) {
        r = { userId: s.userId, name: w?.name ?? "—", shifts: [] };
        g.rows.set(s.userId, r);
      }
      r.shifts.push(s);
    }
    return Array.from(groups.values())
      .map((g) => ({
        position: g.position,
        color: g.color,
        rows: Array.from(g.rows.values()).sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        ),
      }))
      .sort((a, b) => {
        if (a.position === "Sin puesto") return 1;
        if (b.position === "Sin puesto") return -1;
        return a.position.localeCompare(b.position, "es");
      });
  }, [data, selectedDay]);

  const weeklyMinutesByWorker = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data?.shifts ?? []) {
      const startMin = parseHhMm(s.start);
      const endMin = parseHhMm(s.end);
      if (startMin == null || endMin == null) continue;
      const dur = (((endMin - startMin) % 1440) + 1440) % 1440;
      map.set(s.userId, (map.get(s.userId) ?? 0) + dur);
    }
    return map;
  }, [data]);

  const dayHourlyStaff = useMemo(
    () => hourlyStaffCounts(data?.shifts ?? [], selectedDay, cutoff),
    [data, selectedDay, cutoff],
  );

  function openAdd(userId: string, date: string) {
    setShiftModal({ mode: "add", userId, date });
    setStart("09:00");
    setEnd("17:00");
    setNote("");
    setError(null);
  }

  function openEdit(shift: Shift) {
    if (!canManage) return;
    setShiftModal({ mode: "edit", shift });
    setStart(shift.start);
    setEnd(shift.end);
    setNote(shift.note ?? "");
    setError(null);
  }

  async function submitShift(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftModal) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        start,
        end,
        note: note.trim() || undefined,
      };
      const res =
        shiftModal.mode === "add"
          ? await fetch("/api/admin/rrhh/shifts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: shiftModal.userId,
                jornadaDate: shiftModal.date,
                ...body,
              }),
            })
          : await fetch(
              `/api/admin/rrhh/shifts/${encodeURIComponent(shiftModal.shift.shiftId)}?userId=${encodeURIComponent(shiftModal.shift.userId)}&jornadaDate=${shiftModal.shift.jornadaDate}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "No se pudo guardar el turno");
        return;
      }
      setShiftModal(null);
      await load();
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function copyShiftTo(
    shift: Shift,
    targetUserId: string,
    targetDate: string,
  ) {
    if (
      shift.userId === targetUserId &&
      shift.jornadaDate === targetDate
    ) {
      return;
    }
    setCopying(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rrhh/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUserId,
          jornadaDate: targetDate,
          start: shift.start,
          end: shift.end,
          note: shift.note ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "No se pudo copiar el turno");
        return;
      }
      await load();
    } catch {
      setError("Error de red al copiar el turno");
    } finally {
      setCopying(false);
      setDropTarget(null);
    }
  }

  function clearDropTarget() {
    setDropTarget(null);
  }

  async function removeShift(s: Shift) {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/rrhh/shifts/${s.shiftId}?userId=${encodeURIComponent(
          s.userId,
        )}&jornadaDate=${s.jornadaDate}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(json?.error ?? "No se pudo borrar el turno");
        return;
      }
      await load();
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    }
  }

  const rangeLabel = `${weekStart} → ${addDays(weekStart, 6)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToWeek(addDays(weekStart, -7))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            ← Semana
          </button>
          <button
            type="button"
            onClick={() => goToWeek(mondayOf(formatLocalDate(new Date())))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => goToWeek(addDays(weekStart, 7))}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            Semana →
          </button>
          <input
            type="date"
            value={datePick}
            onChange={(e) => {
              setDatePick(e.target.value);
              if (e.target.value) setWeekStart(mondayOf(e.target.value));
            }}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-sm outline-none ring-brand focus:ring-2"
            title="Ir a la semana de una fecha"
          />
          <span className="ml-1 text-sm text-muted">{rangeLabel}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="flex rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("week")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === "week" ? "bg-brand text-white" : "text-muted"
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setView("day")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === "day" ? "bg-brand text-white" : "text-muted"
              }`}
            >
              Día
            </button>
          </div>
          <span>Corte de jornada {cutoff}:00</span>
          {canManage ? (
            <a
              href="/admin/rrhh/configuracion"
              className="text-brand hover:underline"
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

      {canManage ? (
        <p className="text-xs text-muted">
          Arrastra un turno a otra celda para copiarlo a otro día o trabajador.
          {copying ? " Copiando…" : null}
        </p>
      ) : null}

      {view === "week" ? (
        <>
          {/* Móvil / tablet: tarjetas por trabajador, sin scroll horizontal */}
          <div className="flex flex-col gap-3 lg:hidden">
            {loading && !data ? (
              <p className="py-6 text-center text-sm text-muted">Cargando…</p>
            ) : !data || data.workers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No hay trabajadores dados de alta.
              </p>
            ) : (
              data.workers.map((w) => (
                <article
                  key={w.userId}
                  className="rounded-2xl border border-border bg-card p-3 shadow-sm"
                >
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{w.name}</span>
                    <span className="shrink-0 text-xs font-semibold">
                      {fmtHours(weeklyMinutesByWorker.get(w.userId) ?? 0)}
                    </span>
                  </header>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {days.map((d) => {
                      const cell =
                        shiftsByCell.get(`${w.userId}|${d.date}`) ?? [];
                      const drop = shiftDropZoneProps(
                        canManage,
                        { userId: w.userId, date: d.date },
                        dropTarget,
                        setDropTarget,
                        copyShiftTo,
                      );
                      return (
                        <div
                          key={d.date}
                          className={`min-w-0 rounded-lg border border-border/60 bg-background p-1.5 ${
                            drop.isOver
                              ? "bg-brand/10 ring-2 ring-inset ring-brand/40"
                              : ""
                          }`}
                          onDragOver={drop.onDragOver}
                          onDrop={drop.onDrop}
                        >
                          <div className="mb-1 text-[10px] font-medium text-muted">
                            {d.label} {d.dayNum}
                          </div>
                          <DayShifts
                            shifts={cell}
                            canManage={canManage}
                            onAdd={() => openAdd(w.userId, d.date)}
                            onEdit={openEdit}
                            onRemove={removeShift}
                            onDragEnd={clearDropTarget}
                          />
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Escritorio: tabla fluida al ancho disponible */}
          <div className="hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[12%]" />
                <col span={7} />
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    Trabajador
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.date}
                      className="px-1 py-2 text-center text-xs font-medium"
                    >
                      <div>{d.label}</div>
                      <div className="text-[10px] font-normal text-muted">
                        {d.dayNum}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center text-xs font-medium">
                    Total
                  </th>
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
                  data.workers.map((w) => (
                    <tr
                      key={w.userId}
                      className="border-b border-border last:border-0"
                    >
                      <td
                        className="truncate px-2 py-2 text-xs font-medium"
                        title={w.name}
                      >
                        {w.name}
                      </td>
                      {days.map((d) => {
                        const cell =
                          shiftsByCell.get(`${w.userId}|${d.date}`) ?? [];
                        const drop = shiftDropZoneProps(
                          canManage,
                          { userId: w.userId, date: d.date },
                          dropTarget,
                          setDropTarget,
                          copyShiftTo,
                        );
                        return (
                          <td
                            key={d.date}
                            className={`px-1 py-1 align-top ${
                              drop.isOver
                                ? "bg-brand/10 ring-2 ring-inset ring-brand/40"
                                : ""
                            }`}
                            onDragOver={drop.onDragOver}
                            onDrop={drop.onDrop}
                          >
                            <DayShifts
                              shifts={cell}
                              canManage={canManage}
                              onAdd={() => openAdd(w.userId, d.date)}
                              onEdit={openEdit}
                              onRemove={removeShift}
                              onDragEnd={clearDropTarget}
                            />
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-semibold">
                        {fmtHours(weeklyMinutesByWorker.get(w.userId) ?? 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <DayTimeline
          day={selectedDay}
          days={days}
          onSelectDay={setSelectedDay}
          cutoff={cutoff}
          groups={dayGroups}
          loading={loading}
          hasData={!!data}
          canManage={canManage}
          onEditShift={openEdit}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          onCopyShift={copyShiftTo}
          onDragEnd={clearDropTarget}
          hourlyStaff={dayHourlyStaff}
        />
      )}

      {shiftModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitShift}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg"
          >
            <h2 className="mb-1 text-base font-semibold">
              {shiftModal.mode === "edit" ? "Editar turno" : "Nuevo turno"}
            </h2>
            <p className="mb-4 text-xs text-muted">
              Jornada{" "}
              {shiftModal.mode === "edit"
                ? shiftModal.shift.jornadaDate
                : shiftModal.date}
              . Si la hora de fin es anterior a la de inicio, el turno termina
              al día siguiente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="s-start" className="mb-1 block text-sm font-medium">
                  Inicio
                </label>
                <input
                  id="s-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                />
              </div>
              <div>
                <label htmlFor="s-end" className="mb-1 block text-sm font-medium">
                  Fin
                </label>
                <input
                  id="s-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                />
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="s-note" className="mb-1 block text-sm font-medium">
                Nota (opcional)
              </label>
              <input
                id="s-note"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShiftModal(null)}
                className="rounded-full border border-border px-4 py-2 text-sm hover:bg-background"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar turno"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const DAY_COUNT_H = 18;
const DAY_HEADER_H = 18;
const DAY_ROW_H = 26;
const DAY_GROUP_H = 28;
const DAY_TOTAL_W = 44;

function shiftsTotalMinutes(shifts: Shift[]): number {
  let total = 0;
  for (const s of shifts) {
    const startMin = parseHhMm(s.start);
    const endMin = parseHhMm(s.end);
    if (startMin == null || endMin == null) continue;
    total += (((endMin - startMin) % 1440) + 1440) % 1440;
  }
  return total;
}

function DayTotalCell({
  minutes,
  height,
  className = "",
}: {
  minutes: number;
  height: number;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center border-l border-border/50 px-1 text-[10px] font-semibold ${className}`}
      style={{ width: DAY_TOTAL_W, height }}
    >
      {minutes > 0 ? fmtHours(minutes) : "—"}
    </div>
  );
}

/** Rejilla de 24 columnas (una por hora); inline para evitar purga de Tailwind. */
const HOUR_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
};

function hourlyStaffCountsFromShifts(
  shifts: Shift[],
  cutoff: number,
): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    const wallHour = (cutoff + h) % 24;
    const userIds = new Set<string>();
    for (const s of shifts) {
      if (shiftOverlapsHour(s, wallHour)) userIds.add(s.userId);
    }
    return userIds.size;
  });
}

/** Posición % de un turno en la franja de 24 h desde `cutoff`. */
function shiftBarPercent(
  shift: Shift,
  cutoff: number,
): { left: number; width: number } {
  const startMin = parseHhMm(shift.start) ?? 0;
  const endMin = parseHhMm(shift.end) ?? 0;
  const offset = (((startMin - cutoff * 60) % 1440) + 1440) % 1440;
  const dur = (((endMin - startMin) % 1440) + 1440) % 1440;
  const total = 24 * 60;
  return {
    left: (offset / total) * 100,
    width: Math.max((dur / total) * 100, 100 / 48),
  };
}

/** ¿El turno cubre algún minuto de la hora en punto `wallHour` (0–23)? */
function shiftOverlapsHour(shift: Shift, wallHour: number): boolean {
  const startMin = parseHhMm(shift.start);
  const endMin = parseHhMm(shift.end);
  if (startMin == null || endMin == null) return false;
  const hStart = wallHour * 60;
  const hEnd = hStart + 60;
  if (shift.endsNextDay) {
    return startMin < hEnd && 1440 > hStart;
  }
  return startMin < hEnd && endMin > hStart;
}

function hourlyStaffCounts(
  shifts: Shift[],
  day: string,
  cutoff: number,
): number[] {
  return hourlyStaffCountsFromShifts(
    shifts.filter((s) => s.jornadaDate === day),
    cutoff,
  );
}

function DayTimeline({
  day,
  days,
  onSelectDay,
  cutoff,
  groups,
  loading,
  hasData,
  canManage,
  onEditShift,
  dropTarget,
  setDropTarget,
  onCopyShift,
  onDragEnd,
  hourlyStaff,
}: {
  day: string;
  days: { date: string; label: string; dayNum: number }[];
  onSelectDay: (date: string) => void;
  cutoff: number;
  groups: DayGroup[];
  loading: boolean;
  hasData: boolean;
  canManage: boolean;
  onEditShift: (s: Shift) => void;
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  onCopyShift: (shift: Shift, userId: string, date: string) => void;
  onDragEnd: () => void;
  hourlyStaff: number[];
}) {
  const skipClickRef = useRef(false);
  const hours = Array.from({ length: 24 }, (_, h) => ({
    h,
    label: `${String((cutoff + h) % 24).padStart(2, "0")}`,
  }));
  const allDayShifts = groups.flatMap((g) => g.rows.flatMap((r) => r.shifts));
  const dayTotalMinutes = shiftsTotalMinutes(allDayShifts);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelectDay(d.date)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              d.date === day
                ? "border-brand bg-brand text-white"
                : "border-border hover:bg-background"
            }`}
          >
            {d.label} {d.dayNum}
          </button>
        ))}
      </div>

      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Cabecera: Σ + horas */}
        <div className="flex w-full border-b border-border">
          <div className="flex w-[min(168px,20%)] min-w-[120px] shrink-0 flex-col border-r border-border/50">
            <div
              className="flex items-center justify-center border-b border-border/50 text-[10px] font-semibold text-muted"
              style={{ height: DAY_COUNT_H }}
            >
              Σ
            </div>
            <div
              className="flex items-center px-3 text-[11px] font-medium text-muted"
              style={{ height: DAY_HEADER_H }}
            >
              Trabajador
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="border-b border-border/50"
              style={{ ...HOUR_GRID, height: DAY_COUNT_H }}
            >
              {hours.map((h) => (
                <div
                  key={`c-${h.h}`}
                  className="flex items-center justify-center border-l border-border/40 text-[11px] font-semibold text-brand"
                  title={`${hourlyStaff[h.h]} trabajador${hourlyStaff[h.h] === 1 ? "" : "es"} a las ${h.label}:00`}
                >
                  {hourlyStaff[h.h] > 0 ? hourlyStaff[h.h] : ""}
                </div>
              ))}
            </div>
            <div style={{ ...HOUR_GRID, height: DAY_HEADER_H }}>
              {hours.map((h) => (
                <div
                  key={h.h}
                  className="flex items-center justify-center border-l border-border/50 text-[10px] text-muted"
                >
                  {h.label}
                </div>
              ))}
            </div>
          </div>
          <div
            className="flex shrink-0 flex-col border-l border-border/50"
            style={{ width: DAY_TOTAL_W }}
          >
            <div
              className="flex items-center justify-center border-b border-border/50 text-[10px] font-semibold text-brand"
              style={{ height: DAY_COUNT_H }}
              title="Horas totales del día"
            >
              {dayTotalMinutes > 0 ? fmtHours(dayTotalMinutes) : ""}
            </div>
            <div
              className="flex items-center justify-center text-[10px] font-medium text-muted"
              style={{ height: DAY_HEADER_H }}
            >
              Total
            </div>
          </div>
        </div>

        {loading && !hasData ? (
          <div className="px-3 py-6 text-center text-sm text-muted">
            Cargando…
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted">
            No hay turnos este día.
          </div>
        ) : (
          groups.map((g) => {
            const groupShifts = g.rows.flatMap((r) => r.shifts);
            const groupHourly = hourlyStaffCountsFromShifts(groupShifts, cutoff);
            return (
            <div key={g.position} className="border-b border-border last:border-0">
              <div
                className="flex w-full border-y border-zinc-300 bg-zinc-200"
                style={{ height: DAY_GROUP_H }}
              >
                <div className="flex w-[min(168px,20%)] min-w-[120px] shrink-0 items-center gap-2 border-r border-zinc-300 bg-zinc-200 px-3">
                  <PositionBadge name={g.position} color={g.color} />
                  <span className="text-xs font-medium text-muted">
                    {g.rows.length}
                  </span>
                </div>
                <div
                  className="min-w-0 flex-1 bg-zinc-200"
                  style={{ ...HOUR_GRID, height: DAY_GROUP_H }}
                >
                  {hours.map((h) => (
                    <div
                      key={`g-${g.position}-${h.h}`}
                      className="flex items-center justify-center border-l border-zinc-300/80 text-xs font-bold text-brand"
                      title={`${groupHourly[h.h]} en ${g.position} a las ${h.label}:00`}
                    >
                      {groupHourly[h.h] > 0 ? groupHourly[h.h] : ""}
                    </div>
                  ))}
                </div>
                <DayTotalCell
                  minutes={shiftsTotalMinutes(groupShifts)}
                  height={DAY_GROUP_H}
                  className="bg-zinc-200 text-foreground"
                />
              </div>
              {g.rows.map((r) => {
                const drop = shiftDropZoneProps(
                  canManage,
                  { userId: r.userId, date: day },
                  dropTarget,
                  setDropTarget,
                  onCopyShift,
                );
                return (
                  <div
                    key={r.userId}
                    className="flex w-full border-t border-border/50"
                  >
                    <div
                      className="flex w-[min(168px,20%)] min-w-[120px] shrink-0 items-center truncate border-r border-border/50 px-3 text-xs font-medium"
                      style={{ height: DAY_ROW_H }}
                    >
                      <Link
                        href={`/admin/rrhh/trabajadores/${encodeURIComponent(r.userId)}`}
                        className="truncate text-brand hover:underline"
                        title={`Ver ficha de ${r.name}`}
                      >
                        {r.name}
                      </Link>
                    </div>
                    <div
                      className={`relative min-w-0 flex-1 ${
                        drop.isOver
                          ? "bg-brand/10 ring-2 ring-inset ring-brand/40"
                          : ""
                      }`}
                      style={{ height: DAY_ROW_H }}
                      onDragOver={drop.onDragOver}
                      onDrop={drop.onDrop}
                    >
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={HOUR_GRID}
                        aria-hidden
                      >
                        {hours.map((h) => (
                          <div
                            key={h.h}
                            className="border-l border-border/30"
                          />
                        ))}
                      </div>
                      {r.shifts.map((s) => {
                        const bar = shiftBarPercent(s, cutoff);
                        return (
                          <button
                            key={s.shiftId}
                            type="button"
                            draggable={canManage}
                            onClick={
                              canManage
                                ? () => {
                                    if (skipClickRef.current) return;
                                    onEditShift(s);
                                  }
                                : undefined
                            }
                            onDragStart={
                              canManage
                                ? (e) => {
                                    skipClickRef.current = true;
                                    e.dataTransfer.setData(
                                      SHIFT_DRAG_TYPE,
                                      JSON.stringify(s),
                                    );
                                    e.dataTransfer.effectAllowed = "copy";
                                  }
                                : undefined
                            }
                            onDragEnd={
                              canManage
                                ? () => {
                                    onDragEnd();
                                    window.setTimeout(() => {
                                      skipClickRef.current = false;
                                    }, 100);
                                  }
                                : undefined
                            }
                            disabled={!canManage}
                            className={`absolute inset-y-0.5 flex items-center justify-center overflow-hidden rounded px-0.5 text-[9px] font-medium ring-1 ring-inset ${badgeClassForColor(
                              g.color,
                            )} ${
                              canManage
                                ? "cursor-grab hover:opacity-90 active:cursor-grabbing"
                                : "cursor-default"
                            }`}
                            style={{
                              left: `${bar.left}%`,
                              width: `${bar.width}%`,
                            }}
                            title={`${r.name} · ${s.start}–${s.end}${
                              s.endsNextDay ? " (+1)" : ""
                            }${s.note ? ` · ${s.note}` : ""}${
                              canManage
                                ? " · Clic para editar · Arrastra para copiar"
                                : ""
                            }`}
                          >
                            <span className="truncate">
                              {s.start}–{s.end}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <DayTotalCell
                      minutes={shiftsTotalMinutes(r.shifts)}
                      height={DAY_ROW_H}
                    />
                  </div>
                );
              })}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
