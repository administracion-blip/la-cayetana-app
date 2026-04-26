"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConsolationStatus,
  PrizeStatus,
  PrizeStockMap,
  PrizeType,
  SpinLoseReason,
  SpinOutcome,
} from "@/types/models";

const STOCK_KEYS: (keyof PrizeStockMap)[] = [
  "copa",
  "tercio",
  "chupito",
  "rebujito",
  "botella",
];

const STOCK_LABELS: Record<keyof PrizeStockMap, string> = {
  copa: "Copas",
  tercio: "Tercios",
  chupito: "Chupitos",
  rebujito: "Rebujitos",
  botella: "Botellas",
};

const PRIZE_LABEL: Record<PrizeType, string> = {
  copa: "1 Copa",
  tercio: "1 Tercio de cerveza",
  chupito: "2 Chupitos",
  rebujito: "1 J. Rebujito",
  botella: "1 Botella",
};

const LOSE_REASON_LABEL: Record<SpinLoseReason, string> = {
  no_stock: "Sin stock",
  already_won_in_cycle: "Ya ganó en el ciclo",
  random: "Azar",
};

type SpinRow = {
  spinId: string;
  createdAt: string;
  userId: string;
  membershipId: string | null;
  name: string | null;
  email: string | null;
  outcome: SpinOutcome;
  prizeType: PrizeType | null;
  prizeLabel: string | null;
  loseReason: SpinLoseReason | null;
  prize: PrizeRow | null;
};

type PrizeRow = {
  prizeId: string;
  status: PrizeStatus;
  awardedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserName: string | null;
  discardedAt: string | null;
};

type ConsolationRow = {
  consolationId: string;
  awardedAt: string;
  userId: string;
  membershipId: string | null;
  name: string | null;
  email: string | null;
  rewardLabel: string;
  status: ConsolationStatus;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserName: string | null;
};

type Kpis = {
  spinsTotal: number;
  winsTotal: number;
  losesTotal: number;
  prizesAwarded: number;
  prizesPending: number;
  prizesRedeemed: number;
  prizesExpired: number;
  prizesDiscarded: number;
  consolationsAwarded: number;
  consolationsRedeemed: number;
  consolationsExpired: number;
};

type Payload = {
  cycleId: string;
  isActiveCycle: boolean;
  activeCycleId: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  cycleStartHour: number;
  stockInitial: PrizeStockMap;
  stockRemaining: PrizeStockMap;
  kpis: Kpis;
  spins: SpinRow[];
  consolations: ConsolationRow[];
};

type RowKind = "win" | "lose" | "consolation";
type RowFilter = "all" | "wins" | "loses" | "consolations" | "pending";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function AdminRouletteOpsClient() {
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");

  const load = useCallback(
    async (signal?: AbortSignal, dateOverride?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(
          "/api/admin/roulette/cycles",
          window.location.origin,
        );
        const targetDate = dateOverride ?? date;
        if (targetDate) url.searchParams.set("date", targetDate);
        const res = await fetch(url.toString(), {
          credentials: "include",
          signal,
        });
        const json = (await res.json()) as
          | (Payload & { error?: undefined })
          | { error: string };
        if (!res.ok || "error" in json) {
          throw new Error(("error" in json && json.error) || `Error ${res.status}`);
        }
        setData(json as Payload);
        if (!targetDate) {
          setDate((json as Payload).cycleId);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "No se pudo cargar");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [date],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Auto-refresh suave solo en el ciclo activo (cada 30 s).
  useEffect(() => {
    if (!data?.isActiveCycle) return;
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [data?.isActiveCycle, load]);

  const goPrev = () => {
    if (!date) return;
    setDate(addDaysIso(date, -1));
  };
  const goNext = () => {
    if (!date || !data) return;
    if (date >= data.activeCycleId) return;
    setDate(addDaysIso(date, 1));
  };
  const goToday = () => {
    if (!data) return;
    setDate(data.activeCycleId);
  };

  const rows = useMemo(() => {
    if (!data) return [] as TableRow[];
    return buildRows(data.spins, data.consolations);
  }, [data]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "wins" && r.kind !== "win") return false;
      if (filter === "loses" && r.kind !== "lose") return false;
      if (filter === "consolations" && r.kind !== "consolation") return false;
      if (filter === "pending") {
        if (r.kind === "win" && r.prize?.status !== "awarded") return false;
        if (r.kind === "consolation" && r.consolation?.status !== "awarded") return false;
        if (r.kind === "lose") return false;
      }
      if (q) {
        const hay = [r.name, r.email, r.membershipId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  return (
    <div className="space-y-6">
      <DayNavigator
        date={date}
        startsAt={data?.startsAt ?? null}
        endsAt={data?.endsAt ?? null}
        timezone={data?.timezone ?? null}
        canGoNext={!!data && !!date && date < data.activeCycleId}
        isActive={data?.isActiveCycle ?? false}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onPickDate={(d) => setDate(d)}
        onRefresh={() => void load()}
        loading={loading}
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <KpiGrid kpis={data.kpis} />
          <StockGrid initial={data.stockInitial} remaining={data.stockRemaining} />
          <RowsToolbar
            search={search}
            onSearch={setSearch}
            filter={filter}
            onFilter={setFilter}
            total={rows.length}
            shown={filteredRows.length}
          />
          <RowsTable rows={filteredRows} timezone={data.timezone} />
        </>
      ) : !loading ? (
        <p className="text-sm text-muted">Sin datos para esta jornada.</p>
      ) : null}
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

function DayNavigator(props: {
  date: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  canGoNext: boolean;
  isActive: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPickDate: (d: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const window = formatJornada(props.startsAt, props.endsAt, props.timezone);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={props.onPrev}
            disabled={props.loading || !props.date}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
            aria-label="Día anterior"
          >
            ‹
          </button>
          <input
            type="date"
            value={props.date ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (DATE_RE.test(v)) props.onPickDate(v);
            }}
            className="rounded-xl border border-border px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={props.onNext}
            disabled={props.loading || !props.canGoNext}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
            aria-label="Día siguiente"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={props.onToday}
          disabled={props.loading || props.isActive}
          className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.loading}
          className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          {props.loading ? "Actualizando…" : "Refrescar"}
        </button>
        <div className="ml-auto text-xs text-muted">
          {window ? (
            <>
              <span className="font-medium text-foreground">Jornada:</span>{" "}
              {window}
            </>
          ) : null}
          {props.isActive ? (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
              En curso
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function KpiGrid({ kpis }: { kpis: Kpis }) {
  const items = [
    { label: "Tiradas", value: kpis.spinsTotal },
    { label: "Premios", value: kpis.prizesAwarded },
    { label: "Pendientes", value: kpis.prizesPending },
    { label: "Canjeados", value: kpis.prizesRedeemed },
    { label: "Caducados", value: kpis.prizesExpired },
    { label: "Descartados", value: kpis.prizesDiscarded },
    { label: "Rascas", value: kpis.consolationsAwarded },
    { label: "Rascas canjeados", value: kpis.consolationsRedeemed },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
        >
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {it.label}
          </div>
          <div className="mt-0.5 text-2xl font-semibold text-foreground">
            {it.value}
          </div>
        </div>
      ))}
    </section>
  );
}

function StockGrid({
  initial,
  remaining,
}: {
  initial: PrizeStockMap;
  remaining: PrizeStockMap;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Stock por tipo</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STOCK_KEYS.map((k) => {
          const ini = initial[k] ?? 0;
          const rem = remaining[k] ?? 0;
          const used = Math.max(0, ini - rem);
          return (
            <div
              key={k}
              className="rounded-xl border border-border bg-background px-3 py-2"
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {STOCK_LABELS[k]}
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {rem} / {ini}
              </div>
              <div className="text-[11px] text-muted">Entregados: {used}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RowsToolbar({
  search,
  onSearch,
  filter,
  onFilter,
  total,
  shown,
}: {
  search: string;
  onSearch: (v: string) => void;
  filter: RowFilter;
  onFilter: (f: RowFilter) => void;
  total: number;
  shown: number;
}) {
  const filters: { id: RowFilter; label: string }[] = [
    { id: "all", label: "Todo" },
    { id: "wins", label: "Premios" },
    { id: "consolations", label: "Rascas" },
    { id: "loses", label: "Perdidas" },
    { id: "pending", label: "Pendientes" },
  ];
  return (
    <section className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Buscar por nombre, email o carnet"
        className="w-full rounded-xl border border-border px-3 py-2 text-sm sm:w-72"
      />
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilter(f.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              filter === f.id
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-foreground hover:bg-muted/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-muted">
        Mostrando {shown} de {total}
      </span>
    </section>
  );
}

type TableRow = {
  key: string;
  kind: RowKind;
  occurredAt: string;
  userId: string;
  membershipId: string | null;
  name: string | null;
  email: string | null;
  prizeLabel: string | null;
  detail: string;
  statusLabel: string;
  statusTone: "neutral" | "ok" | "warn" | "bad";
  validatorName: string | null;
  expiresAt: string | null;
  redeemedAt: string | null;
  prize: PrizeRow | null;
  consolation: ConsolationRow | null;
};

function buildRows(spins: SpinRow[], consolations: ConsolationRow[]): TableRow[] {
  const rows: TableRow[] = [];
  for (const s of spins) {
    if (s.outcome === "win") {
      rows.push({
        key: `spin:${s.spinId}`,
        kind: "win",
        occurredAt: s.createdAt,
        userId: s.userId,
        membershipId: s.membershipId,
        name: s.name,
        email: s.email,
        prizeLabel: s.prizeLabel ?? (s.prizeType ? PRIZE_LABEL[s.prizeType] : "Premio"),
        detail: "Premio de ruleta",
        statusLabel: prizeStatusLabel(s.prize),
        statusTone: prizeStatusTone(s.prize),
        validatorName: s.prize?.redeemedByUserName ?? null,
        expiresAt: s.prize?.expiresAt ?? null,
        redeemedAt: s.prize?.redeemedAt ?? null,
        prize: s.prize,
        consolation: null,
      });
    } else {
      rows.push({
        key: `spin:${s.spinId}`,
        kind: "lose",
        occurredAt: s.createdAt,
        userId: s.userId,
        membershipId: s.membershipId,
        name: s.name,
        email: s.email,
        prizeLabel: null,
        detail: s.loseReason
          ? `Perdida (${LOSE_REASON_LABEL[s.loseReason]})`
          : "Perdida",
        statusLabel: "—",
        statusTone: "neutral",
        validatorName: null,
        expiresAt: null,
        redeemedAt: null,
        prize: null,
        consolation: null,
      });
    }
  }
  for (const c of consolations) {
    rows.push({
      key: `con:${c.consolationId}`,
      kind: "consolation",
      occurredAt: c.awardedAt,
      userId: c.userId,
      membershipId: c.membershipId,
      name: c.name,
      email: c.email,
      prizeLabel: c.rewardLabel,
      detail: "Rasca de consolación",
      statusLabel: consolationStatusLabel(c),
      statusTone: consolationStatusTone(c),
      validatorName: c.redeemedByUserName,
      expiresAt: c.expiresAt,
      redeemedAt: c.redeemedAt,
      prize: null,
      consolation: c,
    });
  }
  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return rows;
}

function RowsTable({
  rows,
  timezone,
}: {
  rows: TableRow[];
  timezone: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted">
        Sin movimientos para los filtros actuales.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">Hora</th>
            <th className="px-4 py-2">Carnet</th>
            <th className="px-4 py-2">Socio</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Tipo</th>
            <th className="px-4 py-2">Premio / Detalle</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2">Caduca / Canjeado</th>
            <th className="px-4 py-2">Validador</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border align-top">
              <td className="px-4 py-2 font-mono text-xs">
                {formatTime(r.occurredAt, timezone)}
              </td>
              <td className="px-4 py-2 font-mono text-xs">
                {r.membershipId ?? "—"}
              </td>
              <td className="px-4 py-2">{r.name ?? "—"}</td>
              <td className="px-4 py-2 text-xs">{r.email ?? "—"}</td>
              <td className="px-4 py-2 text-xs">
                <KindBadge kind={r.kind} />
              </td>
              <td className="px-4 py-2 text-xs">
                <div className="font-medium text-foreground">
                  {r.prizeLabel ?? "—"}
                </div>
                <div className="text-muted">{r.detail}</div>
              </td>
              <td className="px-4 py-2 text-xs">
                <StatusBadge label={r.statusLabel} tone={r.statusTone} />
              </td>
              <td className="px-4 py-2 text-xs">
                {r.redeemedAt ? (
                  <>
                    <span className="text-muted">Canjeado:</span>{" "}
                    {formatTime(r.redeemedAt, timezone)}
                  </>
                ) : r.expiresAt ? (
                  <>
                    <span className="text-muted">Caduca:</span>{" "}
                    {formatTime(r.expiresAt, timezone)}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2 text-xs">{r.validatorName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KindBadge({ kind }: { kind: RowKind }) {
  if (kind === "win") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
        Premio
      </span>
    );
  }
  if (kind === "consolation") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
        Rasca
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
      Perdida
    </span>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: TableRow["statusTone"];
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-900"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900"
        : tone === "bad"
          ? "bg-rose-100 text-rose-900"
          : "bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function prizeStatusLabel(p: PrizeRow | null): string {
  if (!p) return "—";
  if (p.status === "redeemed") return "Canjeado";
  if (p.status === "expired") return "Caducado";
  if (p.status === "discarded") return "Descartado";
  if (p.status === "awarded") {
    const exp = Date.parse(p.expiresAt);
    if (Number.isFinite(exp) && exp <= Date.now()) return "Vencido";
    return "Pendiente";
  }
  return p.status;
}
function prizeStatusTone(p: PrizeRow | null): TableRow["statusTone"] {
  if (!p) return "neutral";
  if (p.status === "redeemed") return "ok";
  if (p.status === "expired") return "bad";
  if (p.status === "discarded") return "neutral";
  if (p.status === "awarded") {
    const exp = Date.parse(p.expiresAt);
    if (Number.isFinite(exp) && exp <= Date.now()) return "bad";
    return "warn";
  }
  return "neutral";
}
function consolationStatusLabel(c: ConsolationRow): string {
  if (c.status === "redeemed") return "Canjeado";
  if (c.status === "expired") return "Caducado";
  if (c.status === "awarded") {
    const exp = Date.parse(c.expiresAt);
    if (Number.isFinite(exp) && exp <= Date.now()) return "Vencido";
    return "Pendiente";
  }
  return c.status;
}
function consolationStatusTone(c: ConsolationRow): TableRow["statusTone"] {
  if (c.status === "redeemed") return "ok";
  if (c.status === "expired") return "bad";
  if (c.status === "awarded") {
    const exp = Date.parse(c.expiresAt);
    if (Number.isFinite(exp) && exp <= Date.now()) return "bad";
    return "warn";
  }
  return "neutral";
}

function addDaysIso(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatTime(iso: string | null, timezone: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: timezone ?? undefined,
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 19);
  }
}

function formatJornada(
  startsAt: string | null,
  endsAt: string | null,
  timezone: string | null,
): string | null {
  if (!startsAt || !endsAt) return null;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  try {
    const fmtDate = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      timeZone: timezone ?? undefined,
    });
    const fmtTime = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
      hour12: false,
    });
    return `${fmtTime.format(start)} ${fmtDate.format(start)} → ${fmtTime.format(end)} ${fmtDate.format(end)}`;
  } catch {
    return `${start.toISOString()} → ${end.toISOString()}`;
  }
}
