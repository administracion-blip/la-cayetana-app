"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PositionBadge } from "./PositionBadge";

type Worker = {
  userId: string;
  membershipId: string | null;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  positionColor: string | null;
  city: string;
  postalCode: string;
  active: boolean;
  createdAt: string;
};

type Props = {
  canManage: boolean;
};

type SortKey =
  | "membershipId"
  | "name"
  | "email"
  | "phone"
  | "city"
  | "postalCode"
  | "position"
  | "active"
  | "createdAt";

type ActiveFilter = "active" | "inactive" | "all";

const COLUMNS: { key: SortKey; label: string; width: number }[] = [
  { key: "name", label: "Nombre", width: 180 },
  { key: "membershipId", label: "Socio", width: 84 },
  { key: "email", label: "Email", width: 220 },
  { key: "phone", label: "Teléfono", width: 120 },
  { key: "city", label: "Ciudad", width: 130 },
  { key: "postalCode", label: "CP", width: 80 },
  { key: "position", label: "Puesto", width: 140 },
  { key: "active", label: "Activo", width: 110 },
  { key: "createdAt", label: "Alta", width: 120 },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-ES");
}

function compareWorkers(a: Worker, b: Worker, key: SortKey, dir: "asc" | "desc") {
  const mul = dir === "asc" ? 1 : -1;
  switch (key) {
    case "membershipId":
      return (
        (a.membershipId ?? "").localeCompare(b.membershipId ?? "", undefined, {
          numeric: true,
        }) * mul
      );
    case "name":
      return a.name.localeCompare(b.name, "es") * mul;
    case "email":
      return a.email.localeCompare(b.email, "es") * mul;
    case "phone":
      return (a.phone ?? "").localeCompare(b.phone ?? "", "es") * mul;
    case "city":
      return a.city.localeCompare(b.city, "es") * mul;
    case "postalCode":
      return a.postalCode.localeCompare(b.postalCode, undefined, {
        numeric: true,
      }) * mul;
    case "position":
      return (a.position ?? "").localeCompare(b.position ?? "", "es") * mul;
    case "active":
      return ((a.active ? 1 : 0) - (b.active ? 1 : 0)) * mul;
    case "createdAt":
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mul
      );
    default:
      return 0;
  }
}

export function WorkersClient({ canManage }: Props) {
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRows, setInviteRows] = useState<
    { email: string; name: string; phone: string }[]
  >([{ email: "", name: "", phone: "" }]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<
    {
      type: "ok" | "error";
      message: string;
      results?: { email: string; ok: boolean; detail?: string; inviteUrl?: string }[];
    } | null
  >(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/rrhh/workers", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { workers?: Worker[]; error?: string }
        | null;
      if (!res.ok || !data?.workers) {
        setLoadError(data?.error ?? "No se pudo cargar el personal");
        setWorkers([]);
        return;
      }
      setWorkers(data.workers);
    } catch {
      setLoadError("Error de red al cargar el personal");
      setWorkers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(worker: Worker) {
    const next = !worker.active;
    setTogglingId(worker.userId);
    try {
      const res = await fetch(
        `/api/admin/rrhh/workers/${encodeURIComponent(worker.userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: next }),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setFeedback({
          type: "error",
          message: data?.error ?? "No se pudo cambiar el estado",
        });
        return;
      }
      setWorkers((prev) =>
        prev
          ? prev.map((w) =>
              w.userId === worker.userId ? { ...w, active: next } : w,
            )
          : prev,
      );
    } catch {
      setFeedback({ type: "error", message: "Error de red al cambiar el estado" });
    } finally {
      setTogglingId(null);
    }
  }

  function updateRow(idx: number, field: "email" | "name" | "phone", value: string) {
    setInviteRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  function addRow() {
    setInviteRows((prev) => [...prev, { email: "", name: "", phone: "" }]);
  }

  function removeRow(idx: number) {
    setInviteRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const rows = inviteRows
      .map((r) => ({
        email: r.email.trim(),
        name: r.name.trim(),
        phone: r.phone.trim(),
      }))
      .filter((r) => r.email);
    if (rows.length === 0) {
      setFeedback({ type: "error", message: "Introduce al menos un email" });
      return;
    }
    setSending(true);
    try {
      const results: {
        email: string;
        ok: boolean;
        detail?: string;
        inviteUrl?: string;
      }[] = [];
      for (const r of rows) {
        try {
          const res = await fetch("/api/admin/rrhh/workers/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: r.email,
              name: r.name || undefined,
              phone: r.phone || undefined,
            }),
          });
          const data = (await res.json().catch(() => null)) as
            | {
                ok?: boolean;
                warning?: string;
                inviteUrl?: string;
                error?: string;
              }
            | null;
          if (!res.ok || !data?.ok) {
            results.push({
              email: r.email,
              ok: false,
              detail: data?.error ?? "No se pudo enviar",
            });
          } else {
            results.push({
              email: r.email,
              ok: true,
              detail: data.warning,
              inviteUrl: data.inviteUrl,
            });
          }
        } catch {
          results.push({ email: r.email, ok: false, detail: "Error de red" });
        }
      }
      const okCount = results.filter((x) => x.ok).length;
      const failCount = results.length - okCount;
      setFeedback({
        type: failCount === 0 ? "ok" : "error",
        message:
          failCount === 0
            ? `${okCount} invitación${okCount === 1 ? "" : "es"} enviada${okCount === 1 ? "" : "s"} correctamente.`
            : `${okCount} enviada(s), ${failCount} con error.`,
        results,
      });
      if (failCount === 0) {
        setInviteRows([{ email: "", name: "", phone: "" }]);
      } else {
        setInviteRows(
          rows.filter((_, i) => !results[i].ok).map((r) => ({ ...r })),
        );
      }
    } finally {
      setSending(false);
    }
  }

  const positionOptions = useMemo(() => {
    const names = new Set<string>();
    (workers ?? []).forEach((w) => {
      if (w.position) names.add(w.position);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
  }, [workers]);

  const counts = useMemo(() => {
    const all = workers ?? [];
    return {
      all: all.length,
      active: all.filter((w) => w.active).length,
      inactive: all.filter((w) => !w.active).length,
    };
  }, [workers]);

  const filtered = useMemo(() => {
    let base = workers ?? [];
    if (activeFilter === "active") base = base.filter((w) => w.active);
    else if (activeFilter === "inactive") base = base.filter((w) => !w.active);
    if (positionFilter !== "all") {
      base = base.filter((w) => w.position === positionFilter);
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      base = base.filter(
        (w) =>
          w.name.toLowerCase().includes(needle) ||
          w.email.toLowerCase().includes(needle) ||
          (w.phone?.toLowerCase().includes(needle) ?? false) ||
          (w.membershipId?.toLowerCase().includes(needle) ?? false) ||
          w.city.toLowerCase().includes(needle),
      );
    }
    return [...base].sort((a, b) => compareWorkers(a, b, sortKey, sortDir));
  }, [workers, activeFilter, positionFilter, q, sortKey, sortDir]);

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function activeCell(w: Worker) {
    if (canManage) {
      return (
        <button
          type="button"
          disabled={togglingId === w.userId}
          onClick={() => toggleActive(w)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset disabled:opacity-60 ${
            w.active
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
              : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-zinc-200"
          }`}
          title={
            w.active
              ? "Activo: aparece para planificar turnos. Pulsa para dar de baja."
              : "Inactivo: no aparece en cuadrantes. Pulsa para reactivar."
          }
        >
          {togglingId === w.userId ? "…" : w.active ? "Activo" : "Inactivo"}
        </button>
      );
    }
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
          w.active
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-zinc-100 text-zinc-600 ring-zinc-200"
        }`}
      >
        {w.active ? "Activo" : "Inactivo"}
      </span>
    );
  }

  function cellValue(w: Worker, key: SortKey): React.ReactNode {
    switch (key) {
      case "membershipId":
        return (
          <span className="font-mono text-[11px] text-muted">
            {w.membershipId ?? "—"}
          </span>
        );
      case "name":
        return canManage ? (
          <Link
            href={`/admin/rrhh/trabajadores/${w.userId}`}
            className="font-medium text-brand hover:underline"
          >
            {w.name}
          </Link>
        ) : (
          <span className="font-medium">{w.name}</span>
        );
      case "email":
        return <span className="text-muted">{w.email}</span>;
      case "phone":
        return <span className="text-muted">{w.phone ?? "—"}</span>;
      case "city":
        return <span className="text-muted">{w.city}</span>;
      case "postalCode":
        return <span className="text-muted">{w.postalCode}</span>;
      case "position":
        return w.position ? (
          <PositionBadge name={w.position} color={w.positionColor} />
        ) : (
          <span className="text-muted">—</span>
        );
      case "active":
        return activeCell(w);
      case "createdAt":
        return (
          <span className="text-[11px] text-muted">{fmtDate(w.createdAt)}</span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Invitar trabajador</h2>
            <button
              type="button"
              onClick={() => setInviteOpen((v) => !v)}
              className={
                inviteOpen
                  ? "rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-background"
                  : "inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              }
            >
              {inviteOpen ? "Cerrar" : "+ Nueva invitación"}
            </button>
          </div>

          {inviteOpen ? (
            <form onSubmit={onInvite} className="mt-4 flex flex-col gap-3">
              {inviteRows.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <label
                        htmlFor={`w-email-${idx}`}
                        className="mb-1 block text-sm font-medium"
                      >
                        Email
                      </label>
                      <input
                        id={`w-email-${idx}`}
                        type="email"
                        required
                        value={row.email}
                        onChange={(e) => updateRow(idx, "email", e.target.value)}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`w-name-${idx}`}
                        className="mb-1 block text-sm font-medium"
                      >
                        Nombre (opcional)
                      </label>
                      <input
                        id={`w-name-${idx}`}
                        value={row.name}
                        onChange={(e) => updateRow(idx, "name", e.target.value)}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`w-phone-${idx}`}
                        className="mb-1 block text-sm font-medium"
                      >
                        Teléfono (opcional)
                      </label>
                      <input
                        id={`w-phone-${idx}`}
                        type="tel"
                        value={row.phone}
                        onChange={(e) => updateRow(idx, "phone", e.target.value)}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {inviteRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    ) : (
                      <span />
                    )}
                    {idx === inviteRows.length - 1 ? (
                      <button
                        type="button"
                        onClick={addRow}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        + Añadir invitación
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <div>
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
                >
                  {sending
                    ? "Enviando…"
                    : inviteRows.length > 1
                      ? `Enviar invitaciones (${inviteRows.filter((r) => r.email.trim()).length})`
                      : "Enviar invitación"}
                </button>
              </div>
            </form>
          ) : null}

          {feedback ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                feedback.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <p>{feedback.message}</p>
              {feedback.results ? (
                <ul className="mt-1 space-y-1">
                  {feedback.results.map((r, i) => (
                    <li key={i} className="text-xs">
                      <span className={r.ok ? "text-emerald-800" : "text-red-700"}>
                        {r.ok ? "✓" : "✗"} {r.email}
                      </span>
                      {r.detail ? (
                        <span className="text-muted"> — {r.detail}</span>
                      ) : null}
                      {r.inviteUrl ? (
                        <span className="ml-1 block break-all font-mono text-[11px] text-muted">
                          {r.inviteUrl}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Buscador + filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="w-search" className="mb-1 block text-sm text-muted">
            Buscar por nombre, email, teléfono, nº socio o ciudad
          </label>
          <input
            id="w-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-full max-w-md rounded-xl border border-border bg-card px-4 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
        </div>
        <div>
          <label htmlFor="w-pos" className="mb-1 block text-sm text-muted">
            Puesto
          </label>
          <select
            id="w-pos"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          >
            <option value="all">Todos</option>
            {positionOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <span className="mb-1 text-sm text-muted">Estado</span>
          <div className="flex flex-nowrap gap-1 rounded-xl border border-border bg-card p-1 text-xs sm:text-sm">
            {([
              ["active", "Activos", counts.active],
              ["inactive", "Inactivos", counts.inactive],
              ["all", "Todos", counts.all],
            ] as [ActiveFilter, string, number][]).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 ${
                  activeFilter === key
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-zinc-50"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                    activeFilter === key
                      ? "bg-white/20 text-white"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {n}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {/* Móvil / tablet: tarjetas */}
      <div className="space-y-3 lg:hidden">
        {workers === null ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted shadow-sm">
            Cargando personal…
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted shadow-sm">
            No hay trabajadores que coincidan con el filtro.
          </p>
        ) : (
          filtered.map((w) => (
            <article
              key={w.userId}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-muted">
                    {w.membershipId ?? "—"}
                  </p>
                  <h3 className="mt-0.5 text-sm font-semibold leading-tight">
                    {cellValue(w, "name")}
                  </h3>
                  <p className="mt-0.5 break-all text-xs text-muted">{w.email}</p>
                </div>
                {activeCell(w)}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted">Teléfono</dt>
                  <dd className="mt-0.5">{w.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Puesto</dt>
                  <dd className="mt-0.5">
                    {w.position ? (
                      <PositionBadge name={w.position} color={w.positionColor} />
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Ciudad</dt>
                  <dd className="mt-0.5">{w.city}</dd>
                </div>
                <div>
                  <dt className="text-muted">CP</dt>
                  <dd className="mt-0.5">{w.postalCode}</dd>
                </div>
                <div>
                  <dt className="text-muted">Alta</dt>
                  <dd className="mt-0.5">{fmtDate(w.createdAt)}</dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>

      {/* Escritorio: tabla con scroll horizontal y columna fija */}
      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table
          className="text-left text-[12px] leading-tight"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <thead className="border-b border-border bg-zinc-50">
            <tr>
              {COLUMNS.map(({ key, label, width }) => {
                const isSticky = key === "name";
                return (
                  <th
                    key={key}
                    scope="col"
                    style={{ width, ...(isSticky ? { left: 0 } : {}) }}
                    className={`px-3 py-2 font-medium ${
                      isSticky
                        ? "sticky z-20 border-r border-border bg-zinc-50 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onHeaderClick(key)}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <span className="truncate">{label}</span>
                      {sortKey === key ? (
                        <span className="text-muted" aria-hidden>
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {workers === null ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-muted">
                  Cargando personal…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-muted">
                  No hay trabajadores que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              filtered.map((w) => (
                <tr key={w.userId} className="border-b border-border last:border-0">
                  {COLUMNS.map(({ key, width }) => {
                    const isSticky = key === "name";
                    return (
                      <td
                        key={key}
                        style={{ width, ...(isSticky ? { left: 0 } : {}) }}
                        className={`px-3 py-2 align-middle ${
                          isSticky
                            ? "sticky z-10 border-r border-border bg-card shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]"
                            : ""
                        }`}
                      >
                        {cellValue(w, key)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Mostrando {filtered.length} de {counts.all} trabajadores.
      </p>
    </div>
  );
}
