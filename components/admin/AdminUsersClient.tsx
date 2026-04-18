"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { UserRecord } from "@/types/models";

export type SafeUser = Omit<UserRecord, "passwordHash">;

type SortKey =
  | "membershipId"
  | "name"
  | "email"
  | "phone"
  | "sex"
  | "birthYear"
  | "status"
  | "paidAmount"
  | "deliveryStatus"
  | "isAdmin"
  | "createdAt";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "membershipId", label: "Socio" },
  { key: "name", label: "Nombre" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
  { key: "sex", label: "Sexo" },
  { key: "birthYear", label: "Año nac." },
  { key: "status", label: "Estado" },
  { key: "paidAmount", label: "Importe" },
  { key: "deliveryStatus", label: "Entrega" },
  { key: "isAdmin", label: "Admin" },
  { key: "createdAt", label: "Alta" },
];

const DEFAULT_WIDTHS: Record<SortKey, number> = {
  membershipId: 100,
  name: 170,
  email: 220,
  phone: 110,
  sex: 130,
  birthYear: 88,
  status: 100,
  paidAmount: 100,
  deliveryStatus: 220,
  isAdmin: 72,
  createdAt: 160,
};

const SEX_LABEL: Record<string, string> = {
  male: "Hombre",
  female: "Mujer",
  prefer_not_to_say: "Prefiero no decirlo",
};

const MIN_COL = 56;

const EUR_FORMAT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

function formatEuros(cents: number | undefined | null): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "—";
  return EUR_FORMAT.format(cents / 100);
}

function deliveryRank(u: SafeUser): number {
  if (u.status !== "active") return 2;
  return u.deliveryStatus === "delivered" ? 1 : 0;
}

function compareUsers(
  a: SafeUser,
  b: SafeUser,
  key: SortKey,
  dir: "asc" | "desc",
): number {
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
    case "sex":
      return (a.sex ?? "").localeCompare(b.sex ?? "", "es") * mul;
    case "birthYear":
      return ((a.birthYear ?? 0) - (b.birthYear ?? 0)) * mul;
    case "status":
      return a.status.localeCompare(b.status, "es") * mul;
    case "paidAmount":
      return ((a.paidAmount ?? 0) - (b.paidAmount ?? 0)) * mul;
    case "deliveryStatus":
      return (deliveryRank(a) - deliveryRank(b)) * mul;
    case "isAdmin": {
      const va = a.isAdmin ? 1 : 0;
      const vb = b.isAdmin ? 1 : 0;
      return (va - vb) * mul;
    }
    case "createdAt":
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mul
      );
    default:
      return 0;
  }
}

export function AdminUsersClient({ users }: { users: SafeUser[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("membershipId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [widths, setWidths] = useState<Record<SortKey, number>>(() => ({
    ...DEFAULT_WIDTHS,
  }));
  const [onlyPending, setOnlyPending] = useState(false);
  const [rows, setRows] = useState<SafeUser[]>(users);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setRows(users);
  }, [users]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = onlyPending
      ? rows.filter(
          (u) =>
            u.status === "active" &&
            (u.deliveryStatus ?? "pending") === "pending",
        )
      : rows;
    if (!needle) return base;
    return base.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.membershipId?.toLowerCase().includes(needle) ?? false) ||
        (u.phone?.toLowerCase().includes(needle) ?? false),
    );
  }, [rows, q, onlyPending]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareUsers(a, b, sortKey, sortDir));
    return copy;
  }, [filtered, sortKey, sortDir]);

  const pendingCount = useMemo(
    () =>
      rows.filter(
        (u) =>
          u.status === "active" &&
          (u.deliveryStatus ?? "pending") === "pending",
      ).length,
    [rows],
  );

  const onHeaderClick = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const startResize = useCallback((key: SortKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      setWidths((prev) => ({
        ...prev,
        [key]: Math.max(MIN_COL, startW + delta),
      }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widths]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const handleDelivery = useCallback(
    async (user: SafeUser, action: "deliver" | "undo") => {
      if (action === "deliver") {
        const ok = window.confirm(
          `¿Marcar como entregado el bono de ${user.name}?`,
        );
        if (!ok) return;
      } else {
        const ok = window.confirm(
          `Vas a DESHACER la entrega del bono de ${user.name}. ¿Continuar?`,
        );
        if (!ok) return;
      }
      setError(null);
      setPendingId(user.id);
      try {
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(user.id)}/delivery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              user?: {
                deliveryStatus?: "pending" | "delivered";
                deliveredAt?: string | null;
                deliveredByUserId?: string | null;
              };
            }
          | null;
        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "No se pudo actualizar la entrega");
          return;
        }
        startTransition(() => {
          setRows((prev) =>
            prev.map((u) =>
              u.id === user.id
                ? {
                    ...u,
                    deliveryStatus: data.user?.deliveryStatus ?? "pending",
                    deliveredAt: data.user?.deliveredAt ?? undefined,
                    deliveredByUserId:
                      data.user?.deliveredByUserId ?? undefined,
                  }
                : u,
            ),
          );
        });
      } catch (e) {
        console.error(e);
        setError("Error de red al actualizar la entrega");
      } finally {
        setPendingId(null);
      }
    },
    [],
  );

  function cellValue(u: SafeUser, key: SortKey): React.ReactNode {
    switch (key) {
      case "membershipId":
        return (
          <span className="font-mono text-xs">{u.membershipId ?? "—"}</span>
        );
      case "name":
        return u.name;
      case "email":
        return u.email;
      case "phone":
        return <span className="text-muted">{u.phone ?? "—"}</span>;
      case "sex":
        return (
          <span className="text-muted">
            {u.sex ? SEX_LABEL[u.sex] ?? u.sex : "—"}
          </span>
        );
      case "birthYear":
        return (
          <span className="font-mono text-xs text-muted">
            {u.birthYear ?? "—"}
          </span>
        );
      case "status":
        return <span className="capitalize">{u.status}</span>;
      case "paidAmount":
        return (
          <span className="whitespace-nowrap font-mono text-xs">
            {formatEuros(u.paidAmount)}
          </span>
        );
      case "deliveryStatus": {
        if (u.status !== "active") {
          return <span className="text-muted">—</span>;
        }
        const delivered = u.deliveryStatus === "delivered";
        const busy = pendingId === u.id;
        return (
          <div className="flex flex-wrap items-center gap-2">
            {delivered ? (
              <span
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
                title={
                  u.deliveredAt
                    ? `Entregado ${new Date(u.deliveredAt).toLocaleString("es-ES")}`
                    : "Entregado"
                }
              >
                Entregado
                {u.deliveredAt ? (
                  <span className="ml-1 font-normal text-emerald-600">
                    {new Date(u.deliveredAt).toLocaleDateString("es-ES")}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                Pendiente
              </span>
            )}
            {delivered ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelivery(u, "undo")}
                className="rounded-md border border-border bg-white px-2 py-0.5 text-xs text-foreground hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy ? "…" : "Deshacer"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelivery(u, "deliver")}
                className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "…" : "Marcar entregado"}
              </button>
            )}
          </div>
        );
      }
      case "isAdmin":
        return (
          <span className="text-muted">{u.isAdmin ? "Sí" : "—"}</span>
        );
      case "createdAt":
        return (
          <span className="whitespace-nowrap text-muted">
            {new Date(u.createdAt).toLocaleString("es-ES")}
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[260px]">
          <label className="mb-2 block text-sm text-muted" htmlFor="search">
            Buscar por nombre, email o número
          </label>
          <input
            id="search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej. CY0001 o nombre…"
            className="w-full max-w-md rounded-xl border border-border bg-card px-4 py-2 text-[15px] outline-none ring-brand focus:ring-2"
          />
        </div>
        <label className="flex select-none items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          <span>
            Solo pendientes de entrega
            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              {pendingCount}
            </span>
          </span>
        </label>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table
          className="text-left text-sm"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <thead className="border-b border-border bg-zinc-50">
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  style={{ width: widths[key] }}
                  className="relative px-0 py-0 font-medium"
                  aria-sort={
                    sortKey === key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 px-3 py-2 pr-4 text-left hover:bg-zinc-100/80"
                    onClick={() => onHeaderClick(key)}
                  >
                    <span className="truncate">{label}</span>
                    {sortKey === key ? (
                      <span className="shrink-0 text-muted" aria-hidden>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </button>
                  {/* Asa de redimensionado (borde derecho de la columna) */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Redimensionar columna ${label}`}
                    className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-brand/20"
                    onMouseDown={(e) => startResize(key, e)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                {COLUMNS.map(({ key }) => (
                  <td
                    key={key}
                    style={{ width: widths[key] }}
                    className="px-3 py-2 align-top"
                  >
                    {cellValue(u, key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted">
        Mostrando {sorted.length} de {rows.length} socios
        {onlyPending ? " (filtrando pendientes de entrega)" : ""}.
      </p>
    </div>
  );
}
