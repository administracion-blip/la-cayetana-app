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
import {
  formatAmountEuros,
  formatRelativeTimestamp,
} from "@/components/reservations/formatters";
import { ReservationStatusBadge } from "@/components/reservations/ReservationStatusBadge";
import {
  adminGetReservationsSummary,
  adminListNotes,
  adminListReservations,
  adminSetReservationTable,
  type AdminApiError,
} from "@/lib/admin-reservations/client";
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatLocalDate,
} from "@/lib/datetime";
import type {
  AdminReservationDto,
  ReservationNoteDto,
} from "@/lib/serialization/reservations";
import type { PrepaymentStatus, ReservationStatus } from "@/types/models";

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
                  sm:grid-cols-[minmax(0,4.25rem)_1fr_auto_auto] sm:items-start
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
                  className="relative flex items-center gap-1.5 max-sm:shrink-0 sm:min-w-0 sm:pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <BoardNotesCell r={r} />
                  <BoardPrepaymentCell r={r} />
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

const PREPAY_STATUS_LABELS: Record<PrepaymentStatus, string> = {
  not_required: "No aplica",
  pending_instructions: "Pendiente de enviar instrucciones",
  awaiting_transfer: "Esperando transferencia",
  received: "Recibida",
  refunded: "Devuelta",
};

function useEscapeKey(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, onClose]);
}

/**
 * Botón pequeño de notas con indicador visual cuando la reserva tiene
 * nota del cliente. Al abrir, muestra un modal con la nota del cliente y
 * las notas internas (solo lectura; para añadir, se entra a la ficha).
 */
function BoardNotesCell({ r }: { r: AdminReservationDto }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ReservationNoteDto[] | null>(null);

  const hasClientNote = !!r.notes?.trim();

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  useEscapeKey(open, close);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { notes: fetched } = await adminListNotes(r.reservationId);
      setNotes(fetched);
    } catch (err) {
      const a = err as AdminApiError;
      setError(a?.message ?? "No se pudieron cargar las notas");
    } finally {
      setLoading(false);
    }
  }, [r.reservationId]);

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      void loadNotes();
    },
    [loadNotes],
  );

  const hasInternalNotes = (notes?.length ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        title={hasClientNote ? "Ver notas (el cliente dejó una)" : "Ver notas"}
        aria-label="Ver notas"
        onClick={handleOpen}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg
          border-2 border-border bg-white text-foreground shadow-sm transition
          hover:border-brand/50 hover:bg-muted/30 active:scale-[0.98]"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 4h12l4 4v12H4z" />
          <path d="M16 4v4h4" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
        {hasClientNote ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-amber-500"
            aria-hidden
          />
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[120] touch-none bg-black/35"
            aria-hidden
            onClick={close}
          />
          <div
            className="fixed left-1/2 top-1/2 z-[130] w-[min(28rem,92vw)]
              -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border
              bg-white p-4 shadow-xl animate-in fade-in zoom-in-95
              max-h-[85vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`notes-dialog-${r.reservationId}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3
                  id={`notes-dialog-${r.reservationId}`}
                  className="text-sm font-semibold text-foreground"
                >
                  Notas de la reserva
                </h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.contact.name} · {r.reservationDate} · {r.reservationTime}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full px-2 py-1 text-xs text-muted hover:bg-muted/30"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <section className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Nota del cliente
              </p>
              {hasClientNote ? (
                <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground">
                  {r.notes}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  El cliente no ha dejado nota.
                </p>
              )}
            </section>

            <section className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Notas internas
              </p>
              {loading ? (
                <p className="mt-1 text-xs text-muted">Cargando…</p>
              ) : error ? (
                <p className="mt-1 text-xs text-rose-700" role="alert">
                  {error}
                </p>
              ) : hasInternalNotes ? (
                <ul className="mt-2 space-y-2">
                  {(notes ?? [])
                    .slice()
                    .reverse()
                    .map((n) => (
                      <li
                        key={n.noteId}
                        className="rounded-xl border border-border bg-muted/20 p-3 text-sm"
                      >
                        <p className="whitespace-pre-wrap">{n.body}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {n.createdByDisplayName} ·{" "}
                          {formatRelativeTimestamp(n.createdAt)}
                        </p>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">Sin notas internas.</p>
              )}
            </section>

            <div className="mt-4 flex justify-end">
              <Link
                href={`/admin/reservas/${r.reservationId}`}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium
                  text-foreground hover:bg-muted/30"
                onClick={close}
              >
                Abrir ficha para añadir/editar notas
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * Botón pequeño con el importe de la señal. Solo se muestra si la reserva
 * tiene señal solicitada. Al abrir, expone un modal de solo lectura con
 * estado, plazo, instrucciones, justificantes (con enlaces) y total
 * recibido.
 */
function BoardPrepaymentCell({ r }: { r: AdminReservationDto }) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  useEscapeKey(open, close);

  if (!r.prepaymentAmountCents || r.prepaymentAmountCents <= 0) return null;

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const statusLabel = PREPAY_STATUS_LABELS[r.prepaymentStatus];
  const deadline = r.prepaymentDeadlineAt
    ? new Date(r.prepaymentDeadlineAt).toLocaleString("es-ES")
    : null;
  const receivedAt = r.prepaymentReceivedAt
    ? new Date(r.prepaymentReceivedAt).toLocaleString("es-ES")
    : null;

  const proofItems = r.prepaymentProofItems ?? [];
  const totalReceived = r.prepaymentTotalReceivedCents ?? 0;

  return (
    <>
      <button
        type="button"
        title={`Señal ${formatAmountEuros(r.prepaymentAmountCents)} · ${statusLabel}`}
        aria-label={`Señal: ${formatAmountEuros(r.prepaymentAmountCents)}`}
        onClick={handleOpen}
        className={`flex h-10 shrink-0 items-center justify-center rounded-lg border-2 px-2
          text-xs font-semibold tabular-nums shadow-sm transition active:scale-[0.98]
          ${
            r.prepaymentStatus === "received"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              : r.prepaymentStatus === "refunded"
                ? "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          }`}
      >
        {formatAmountEuros(r.prepaymentAmountCents)}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[120] touch-none bg-black/35"
            aria-hidden
            onClick={close}
          />
          <div
            className="fixed left-1/2 top-1/2 z-[130] w-[min(28rem,92vw)]
              -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border
              bg-white p-4 shadow-xl animate-in fade-in zoom-in-95
              max-h-[85vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`prepay-dialog-${r.reservationId}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3
                  id={`prepay-dialog-${r.reservationId}`}
                  className="text-sm font-semibold text-foreground"
                >
                  Prepago / señal
                </h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.contact.name} · {r.reservationDate} · {r.reservationTime}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full px-2 py-1 text-xs text-muted hover:bg-muted/30"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-xs text-muted">Importe solicitado</dt>
              <dd className="text-right font-semibold tabular-nums text-foreground">
                {formatAmountEuros(r.prepaymentAmountCents)}
              </dd>
              <dt className="text-xs text-muted">Estado</dt>
              <dd className="text-right font-medium text-foreground">
                {statusLabel}
              </dd>
              {deadline ? (
                <>
                  <dt className="text-xs text-muted">Plazo</dt>
                  <dd className="text-right text-foreground">{deadline}</dd>
                </>
              ) : null}
              {receivedAt ? (
                <>
                  <dt className="text-xs text-muted">Recibida</dt>
                  <dd className="text-right text-foreground">{receivedAt}</dd>
                </>
              ) : null}
              {totalReceived > 0 ? (
                <>
                  <dt className="text-xs text-muted">Total cobrado</dt>
                  <dd className="text-right font-semibold tabular-nums text-emerald-900">
                    {formatAmountEuros(totalReceived)}
                  </dd>
                </>
              ) : null}
            </dl>

            {r.prepaymentInstructions ? (
              <section className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Instrucciones enviadas
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-3 text-xs text-foreground">
                  {r.prepaymentInstructions}
                </p>
              </section>
            ) : null}

            {proofItems.length > 0 ? (
              <section className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Justificantes
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {proofItems.map((p) => {
                    const href = `/api/admin/reservations/${encodeURIComponent(
                      r.reservationId,
                    )}/prepayment/proof${
                      p.proofId && p.proofId !== "legacy"
                        ? `?proofId=${encodeURIComponent(p.proofId)}`
                        : ""
                    }`;
                    return (
                      <li
                        key={p.proofId}
                        className="flex items-baseline justify-between gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-xs"
                      >
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate font-medium text-brand underline"
                          title={p.fileName}
                        >
                          {p.fileName}
                        </a>
                        <span className="shrink-0 tabular-nums text-foreground">
                          {p.amountCents > 0
                            ? formatAmountEuros(p.amountCents)
                            : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Link
                href={`/admin/reservas/${r.reservationId}`}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium
                  text-foreground hover:bg-muted/30"
                onClick={close}
              >
                Abrir ficha
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </>
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
