"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ReservationStatusBadge } from "@/components/reservations/ReservationStatusBadge";
import {
  adminGetReservationsSummary,
  adminListReservations,
  adminSetReservationTable,
  type AdminApiError,
} from "@/lib/admin-reservations/client";
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatLocalDate,
} from "@/lib/datetime";
import type { AdminReservationDto } from "@/lib/serialization/reservations";
import type { ReservationStatus } from "@/types/models";

type Filter = "active" | "today" | "tomorrow" | "by_status" | "by_date";

const ACTIVE_STATUSES: ReservationStatus[] = [
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
];

const ALL_STATUSES: { key: ReservationStatus; label: string }[] = [
  { key: "pending", label: "Pendientes" },
  { key: "awaiting_customer", label: "Esperan cliente" },
  { key: "awaiting_prepayment", label: "Esperan señal" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "cancelled_by_customer", label: "Canc. cliente" },
  { key: "cancelled_by_staff", label: "Canc. staff" },
  { key: "no_show", label: "No show" },
  { key: "completed", label: "Completadas" },
];

/** Reservas excluidas al sumar comensales (Hoy / Mañana). */
const EXCLUDE_FROM_COVERS_SUM: Set<ReservationStatus> = new Set([
  "cancelled_by_customer",
  "cancelled_by_staff",
]);

/** Colores pastel por estado (inactivo / seleccionado en la fila "Por estado"). */
const PASTEL_STATUS_CHIPS: Record<
  ReservationStatus,
  { rest: string; active: string }
> = {
  pending: {
    rest: "border-amber-200/80 bg-amber-100/80 text-amber-950",
    active:
      "border-amber-300 bg-amber-200/95 text-amber-950 ring-1 ring-amber-400/60",
  },
  awaiting_customer: {
    rest: "border-sky-200/80 bg-sky-100/80 text-sky-950",
    active:
      "border-sky-300 bg-sky-200/90 text-sky-950 ring-1 ring-sky-400/50",
  },
  awaiting_prepayment: {
    rest: "border-orange-200/80 bg-orange-100/80 text-orange-950",
    active:
      "border-orange-300 bg-orange-200/90 text-orange-950 ring-1 ring-orange-400/50",
  },
  confirmed: {
    rest: "border-emerald-200/80 bg-emerald-100/80 text-emerald-950",
    active:
      "border-emerald-300 bg-emerald-200/90 text-emerald-950 ring-1 ring-emerald-500/40",
  },
  cancelled_by_customer: {
    rest: "border-rose-200/80 bg-rose-100/80 text-rose-950",
    active: "border-rose-300 bg-rose-200/90 text-rose-950 ring-1 ring-rose-400/50",
  },
  cancelled_by_staff: {
    rest: "border-fuchsia-200/80 bg-fuchsia-100/80 text-fuchsia-950",
    active:
      "border-fuchsia-300 bg-fuchsia-200/90 text-fuchsia-950 ring-1 ring-fuchsia-400/50",
  },
  no_show: {
    rest: "border-slate-300/80 bg-slate-200/70 text-slate-900",
    active:
      "border-slate-400 bg-slate-300/80 text-slate-950 ring-1 ring-slate-500/40",
  },
  completed: {
    rest: "border-violet-200/80 bg-violet-100/80 text-violet-950",
    active:
      "border-violet-300 bg-violet-200/90 text-violet-950 ring-1 ring-violet-400/50",
  },
};

type BoardProps = {
  /** Año (fecha de reserva) para listado y conteos. */
  year: number;
  /** Cada incremento vuelve a pedir listado y resumen (p. ej. botón "Actualizar" en la cabecera). */
  refreshKey?: number;
  onLoadingChange?: (loading: boolean) => void;
};

export function AdminReservationsBoard({
  year,
  refreshKey = 0,
  onLoadingChange,
}: BoardProps) {
  const [filter, setFilter] = useState<Filter>("active");
  /** Si está activo, solo filas con mensajes del cliente aún no leídos por el equipo. */
  const [onlyUnreadChat, setOnlyUnreadChat] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ReservationStatus>(
    "pending",
  );
  /** Misma lógica en SSR y en el cliente (no usar getDate() "local" del entorno). */
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    formatLocalDate(new Date(), DEFAULT_TIMEZONE),
  );
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [items, setItems] = useState<AdminReservationDto[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<
    ReservationStatus,
    number
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const args: Parameters<typeof adminListReservations>[0] = {};
      if (filter === "active") args.status = ACTIVE_STATUSES;
      else if (filter === "by_status") args.status = [selectedStatus];
      // "today" resuelve en el servidor con la misma zona que el GSI by-date
      // (ver GET /api/admin/reservations?date=today); evita mezclar días con
      // new Date() en el navegador.
      else if (filter === "today") args.date = "today";
      else if (filter === "tomorrow") args.date = "tomorrow";
      else if (filter === "by_date") args.date = selectedDate;
      if (debouncedQuery.trim()) args.q = debouncedQuery.trim();
      args.year = year;
      const [data, summary] = await Promise.all([
        adminListReservations(args),
        adminGetReservationsSummary({ year }).catch(() => null),
      ]);
      setItems(data.reservations);
      if (summary) {
        setStatusCounts(summary.byStatus as Record<ReservationStatus, number>);
      }
    } catch (err) {
      const apiErr = err as AdminApiError;
      setError(apiErr?.message ?? "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [filter, selectedStatus, selectedDate, debouncedQuery, year]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const displayItems = useMemo(() => {
    if (!onlyUnreadChat) return items;
    return items.filter((r) => r.unreadForStaff > 0);
  }, [items, onlyUnreadChat]);

  const pendingReplyCount = useMemo(
    () => items.filter((r) => r.unreadForStaff > 0).length,
    [items],
  );

  const activasCountSum = useMemo(() => {
    if (!statusCounts) return null;
    return ACTIVE_STATUSES.reduce((n, s) => n + (statusCounts[s] ?? 0), 0);
  }, [statusCounts]);

  const comensalesDiaSinCancel = useMemo(() => {
    if (filter !== "today" && filter !== "tomorrow") return null;
    return items.reduce((sum, r) => {
      if (EXCLUDE_FROM_COVERS_SUM.has(r.status)) return sum;
      return sum + r.partySize;
    }, 0);
  }, [items, filter]);

  /** Misma noción de hoy/mañana que `date=today|tomorrow` en la API. */
  const comensalesFilterDateIso = useMemo(() => {
    if (filter === "today")
      return formatLocalDate(new Date(), DEFAULT_TIMEZONE);
    if (filter === "tomorrow") {
      const today = formatLocalDate(new Date(), DEFAULT_TIMEZONE);
      return addDays(today, 1);
    }
    return null;
  }, [filter]);

  const patchReservationInList = useCallback((r: AdminReservationDto) => {
    setItems((prev) =>
      prev.map((x) => (x.reservationId === r.reservationId ? r : x)),
    );
  }, []);

  /** Bloques por día: fecha local ascendente (más antigua arriba). En cada día: hora de servicio ascendente. */
  const grouped = useMemo(() => {
    const map = new Map<string, AdminReservationDto[]>();
    for (const r of displayItems) {
      const key = r.reservationDate;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        a.reservationStartAtIso.localeCompare(b.reservationStartAtIso),
      );
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [displayItems]);

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-white p-2.5 sm:p-3 shadow-sm">
        <FilterChip
          label={
            activasCountSum != null
              ? `Activas (${activasCountSum})`
              : "Activas"
          }
          active={filter === "active"}
          onClick={() => setFilter("active")}
        />
        <FilterChip
          label="Hoy"
          active={filter === "today"}
          onClick={() => setFilter("today")}
        />
        <FilterChip
          label="Mañana"
          active={filter === "tomorrow"}
          onClick={() => setFilter("tomorrow")}
        />
        <FilterChip
          label="Por estado"
          active={filter === "by_status"}
          onClick={() => setFilter("by_status")}
        />
        <FilterChip
          label="Por fecha"
          active={filter === "by_date"}
          onClick={() => setFilter("by_date")}
        />
        <FilterChip
          label={
            pendingReplyCount > 0
              ? `Para contestar (${pendingReplyCount})`
              : "Para contestar"
          }
          active={onlyUnreadChat}
          onClick={() => setOnlyUnreadChat((v) => !v)}
        />
        {filter === "by_status" ? (
          <select
            value={selectedStatus}
            onChange={(e) =>
              setSelectedStatus(e.target.value as ReservationStatus)
            }
            className="min-w-0 max-w-full rounded-xl border border-border px-3 py-2 text-sm sm:ms-2"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
        {filter === "by_date" ? (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="min-w-0 max-w-full rounded-xl border border-border px-3 py-2 text-sm sm:ms-2"
          />
        ) : null}
        <input
          type="text"
          placeholder="Buscar (nombre, email, teléfono)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 w-full max-w-full basis-full rounded-xl border border-border px-3 py-2 text-sm
            sm:ms-auto sm:max-w-xs sm:basis-auto"
        />
      </div>

      {(filter === "today" || filter === "tomorrow") &&
      comensalesDiaSinCancel != null ? (
        <p
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-border bg-white px-3 py-2 text-sm shadow-sm"
          role="status"
        >
          {comensalesFilterDateIso ? (
            <>
              <span className="font-semibold capitalize text-foreground">
                {formatWeekdayEs(comensalesFilterDateIso)}
              </span>
              <span className="font-medium text-muted-foreground">
                {formatDateOnlyLongEs(comensalesFilterDateIso)}
              </span>
            </>
          ) : null}
          <span className="text-xl font-bold tabular-nums text-brand">
            {comensalesDiaSinCancel}
          </span>
          <span className="font-medium text-foreground">
            comensales
          </span>
        </p>
      ) : null}

      <div className="space-y-2 rounded-2xl border border-border bg-white p-2.5 sm:p-3 shadow-sm">
        <p className="px-0.5 text-[10px] font-medium text-muted sm:text-[11px]">
          Por estado · año {year}
          {statusCounts ? (
            <span className="font-normal text-muted-foreground/90">
              {" "}
              (máx. 500 / estado)
            </span>
          ) : null}
        </p>
        <div className="-mx-1 flex max-w-full flex-nowrap gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin] sm:mx-0 sm:gap-1.5">
          {ALL_STATUSES.map(({ key, label }) => (
            <StatusFilterChip
              key={key}
              status={key}
              label={
                statusCounts != null
                  ? `${label} (${statusCounts[key] ?? 0})`
                  : label
              }
              active={filter === "by_status" && selectedStatus === key}
              onClick={() => {
                setFilter("by_status");
                setSelectedStatus(key);
              }}
            />
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {displayItems.length === 0 && !loading ? (
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
          {onlyUnreadChat && items.length > 0
            ? "Ninguna reserva de esta vista tiene mensajes del cliente sin leer. Prueba a ampliar el filtro (p. ej. Activas) o quitar «Para contestar»."
            : "Sin reservas con los filtros actuales."}
        </div>
      ) : null}

      {grouped.map(([date, rows]) => (
        <section
          key={date}
          className="rounded-2xl border border-border bg-white p-3 shadow-sm sm:p-5"
        >
          <h2 className="mb-3 min-w-0 break-words text-sm font-semibold leading-snug text-foreground first-letter:uppercase">
            {formatDateLong(date)}
            <span className="ml-2 font-normal text-muted">
              · {rows.length}{" "}
              {rows.length === 1 ? "reserva" : "reservas"}
            </span>
          </h2>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.reservationId}
                className="flex max-sm:items-start max-sm:gap-1 sm:grid
                  sm:grid-cols-[minmax(0,4.25rem)_1fr_auto_2.75rem] sm:items-start
                  sm:gap-2 sm:py-3
                  py-2.5 text-sm transition
                  [transition-property:color,box-shadow,background] hover:bg-muted/30"
              >
                <Link
                  href={`/admin/reservas/${r.reservationId}`}
                  className="min-w-0 max-sm:block max-sm:flex-1
                    sm:contents
                  "
                >
                  {/* Móvil: 14:45 | nombre / 4 pax | contacto; línea roja compartida */}
                  <div
                    className="grid w-full [grid-template-columns:auto_2px_1fr] [grid-template-rows:auto_auto] gap-x-2 gap-y-0.5
                      sm:hidden"
                  >
                    <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1">
                      <span className="text-base font-semibold tabular-nums leading-none">
                        {r.reservationTime}
                      </span>
                      {r.unreadForStaff > 0 ? (
                        <span
                          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center
                            rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none
                            text-white shadow-sm"
                          title="Mensaje del cliente sin leer"
                          aria-label={`${r.unreadForStaff} mensaje${
                            r.unreadForStaff === 1 ? "" : "s"
                          } del cliente sin leer`}
                        >
                          {r.unreadForStaff > 99 ? "99+" : r.unreadForStaff}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="col-start-2 row-start-1 row-span-2 w-0.5 self-stretch justify-self-center
                        bg-red-600"
                      aria-hidden
                    />
                    <div className="col-start-3 row-start-1 min-w-0 text-left">
                      <p className="truncate text-[15px] font-medium leading-tight text-foreground">
                        {r.contact.name}
                      </p>
                    </div>
                    <div className="col-start-1 row-start-2 self-start">
                      <span
                        className="inline-flex items-center justify-center rounded-full border
                          border-zinc-200/90 bg-zinc-100/90 px-1.5 py-0.5 text-[10px] font-semibold
                          leading-none text-zinc-800"
                        title="Comensales"
                      >
                        {r.partySize} pax
                      </span>
                    </div>
                    <div className="col-start-3 row-start-2 min-w-0 self-start text-left">
                      <p className="break-words text-[11px] leading-snug text-muted">
                        {r.contact.email} · {r.contact.phone}
                        {r.isGuest ? " · guest" : ""}
                      </p>
                    </div>
                  </div>

                  {/* sm+: tablero ancho, sin grilla 2+2 móvil */}
                  <div
                    className="hidden max-w-[4.5rem] flex-col items-start gap-0.5 sm:flex
                      sm:shrink-0"
                  >
                    <span
                      className="flex w-full items-center gap-1.5 text-lg font-semibold leading-none
                        tabular-nums"
                    >
                      {r.reservationTime}
                      {r.unreadForStaff > 0 ? (
                        <span
                          className="inline-flex h-5 min-w-5 items-center justify-center
                            rounded-full bg-amber-500 px-1 text-[10px] font-bold
                            leading-none text-white shadow-sm"
                          title="Mensaje del cliente sin leer"
                          aria-label={`${r.unreadForStaff} mensaje${
                            r.unreadForStaff === 1 ? "" : "s"
                          } del cliente sin leer`}
                        >
                          {r.unreadForStaff > 99 ? "99+" : r.unreadForStaff}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="inline-flex max-w-full items-center justify-center rounded-full border
                        border-zinc-200/90 bg-zinc-100/90 px-1.5 py-0.5 text-[10px] font-semibold
                        leading-none text-zinc-800"
                      title="Comensales"
                    >
                      {r.partySize} pax
                    </span>
                  </div>
                  <div className="hidden min-w-0 sm:block sm:pt-0.5">
                    <p className="truncate text-[15px] font-medium leading-tight text-foreground">
                      {r.contact.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {r.contact.email} · {r.contact.phone}
                      {r.isGuest ? " · guest" : ""}
                    </p>
                  </div>
                  <div className="mt-1.5 w-full sm:mt-0 sm:flex sm:justify-end sm:pt-0.5">
                    <ReservationStatusBadge status={r.status} />
                  </div>
                </Link>
                <div
                  className="relative max-sm:shrink-0 sm:min-w-0 sm:pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <BoardMesaCell
                    r={r}
                    peerDayRows={rows}
                    onSaved={patchReservationInList}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function mesaKeyForCompare(raw?: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return t.toLowerCase();
}

function hasMesaDuplicatedForSlot(
  peerDayRows: AdminReservationDto[],
  self: AdminReservationDto,
  label: string | undefined,
): boolean {
  const k = mesaKeyForCompare(label);
  if (k == null) return false;
  return peerDayRows.some(
    (o) =>
      o.reservationId !== self.reservationId &&
      o.reservationTime === self.reservationTime &&
      mesaKeyForCompare(o.tableLabel) === k,
  );
}

function onlyDigits(s: string, maxLen: number): string {
  return s.replace(/\D/g, "").slice(0, maxLen);
}

function BoardMesaCell({
  r,
  peerDayRows,
  onSaved,
}: {
  r: AdminReservationDto;
  peerDayRows: AdminReservationDto[];
  onSaved: (next: AdminReservationDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(
    onlyDigits((r.tableLabel ?? "").replace(/\D/g, ""), 4),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const tableDisplay = (r.tableLabel?.trim() ?? "")
    .replace(/\D/g, "")
    .slice(0, 4);

  const effectiveLabel = open ? draft : (r.tableLabel ?? "");
  const duplicateWarning = hasMesaDuplicatedForSlot(
    peerDayRows,
    r,
    effectiveLabel,
  );

  const resetDraftFromReservation = useCallback(() => {
    setDraft(onlyDigits((r.tableLabel ?? "").replace(/\D/g, ""), 4));
  }, [r.tableLabel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        setErr(null);
        resetDraftFromReservation();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, resetDraftFromReservation]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setErr(null);
      setSaving(true);
      try {
        const label = draft === "" ? "" : draft;
        const { reservation } = await adminSetReservationTable(
          r.reservationId,
          {
            tableLabel: label,
            expectedVersion: r.version,
          },
        );
        onSaved(reservation);
        setOpen(false);
        setDraft(
          onlyDigits((reservation.tableLabel ?? "").replace(/\D/g, ""), 4),
        );
      } catch (ex) {
        const a = ex as AdminApiError;
        setErr(a?.message ?? "Error al guardar");
      } finally {
        setSaving(false);
      }
    },
    [draft, onSaved, r.reservationId, r.version],
  );

  const closePopover = useCallback(() => {
    setOpen(false);
    setErr(null);
    resetDraftFromReservation();
  }, [resetDraftFromReservation]);

  return (
    <div
      ref={popoverRef}
      className="flex justify-end"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={r.tableLabel?.trim() ? `Mesa ${r.tableLabel}` : "Asignar mesa"}
        aria-expanded={open}
        aria-label={r.tableLabel?.trim() ? `Mesa ${r.tableLabel}` : "Mesa"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setErr(null);
          setDraft(onlyDigits((r.tableLabel ?? "").replace(/\D/g, ""), 4));
          setOpen((v) => !v);
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2
          border-border bg-white text-sm font-semibold tabular-nums text-foreground
          shadow-sm transition hover:border-brand/50 hover:bg-muted/30
          active:scale-[0.98]"
      >
        {tableDisplay ? (
          <span className="max-w-full truncate px-0.5 text-base leading-none">
            {tableDisplay}
          </span>
        ) : (
          <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">
            M
          </span>
        )}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[120] touch-none bg-black/35"
            aria-hidden
            onClick={closePopover}
          />
          <div
            className="fixed left-1/2 top-1/2 z-[130] w-[min(16.5rem,90vw)]
              -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border
              bg-white p-4 shadow-xl animate-in fade-in zoom-in-95"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mesa-popover-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3
              id="mesa-popover-title"
              className="text-sm font-semibold text-foreground"
            >
              Número de mesa
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Solo números. Vacía para quitar.
            </p>
            <form
              onSubmit={onSubmit}
              className="mt-3 space-y-3"
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft}
                onChange={(e) => {
                  setDraft(onlyDigits(e.target.value, 4));
                  setErr(null);
                }}
                className="w-full rounded-xl border border-border bg-muted/20 px-3 py-2.5
                  text-center text-2xl font-semibold tabular-nums text-foreground
                  outline-none ring-brand/0 transition focus:ring-2 focus:ring-brand/40"
                placeholder="0"
                aria-label="Número de mesa"
                maxLength={4}
              />
              {duplicateWarning ? (
                <p
                  className="text-center text-xs leading-tight text-amber-800"
                  role="status"
                >
                  Aviso: otra reserva a esta hora ya usa esta mesa.
                </p>
              ) : null}
              {err ? (
                <p className="text-center text-xs text-rose-700">{err}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={(e) => {
                    e.stopPropagation();
                    closePopover();
                  }}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-muted
                    underline-offset-2 hover:underline"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white
                    shadow-sm hover:bg-brand-hover disabled:opacity-60"
                >
                  {saving ? "…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-brand text-white"
          : "border border-border bg-muted/20 text-foreground hover:bg-muted/40"
      }`}
    >
      {label}
    </button>
  );
}

function StatusFilterChip({
  status,
  label,
  active,
  onClick,
}: {
  status: ReservationStatus;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const c = PASTEL_STATUS_CHIPS[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight transition sm:px-2.5 sm:text-[11px] ${
        active ? c.active : `${c.rest} hover:opacity-90`
      }`}
    >
      {label}
    </button>
  );
}

const MADRID_TZ = "Europe/Madrid";

function zonedNoonFromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function formatWeekdayEs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      timeZone: MADRID_TZ,
    }).format(zonedNoonFromIsoDate(iso));
  } catch {
    return "";
  }
}

function formatDateOnlyLongEs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: MADRID_TZ,
    }).format(zonedNoonFromIsoDate(iso));
  } catch {
    return iso;
  }
}

function formatDateLong(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: MADRID_TZ,
    }).format(zonedNoonFromIsoDate(iso));
  } catch {
    return iso;
  }
}
