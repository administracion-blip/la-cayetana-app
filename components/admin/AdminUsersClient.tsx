"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserRecord } from "@/types/models";

export type SafeUser = Omit<UserRecord, "passwordHash">;

type SortKey =
  | "membershipId"
  | "name"
  | "email"
  | "phone"
  | "status"
  | "isAdmin"
  | "createdAt";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "membershipId", label: "Socio" },
  { key: "name", label: "Nombre" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
  { key: "status", label: "Estado" },
  { key: "isAdmin", label: "Admin" },
  { key: "createdAt", label: "Alta" },
];

const DEFAULT_WIDTHS: Record<SortKey, number> = {
  membershipId: 100,
  name: 170,
  email: 220,
  phone: 110,
  status: 100,
  isAdmin: 72,
  createdAt: 160,
};

const MIN_COL = 56;

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
        a.membershipId.localeCompare(b.membershipId, undefined, {
          numeric: true,
        }) * mul
      );
    case "name":
      return a.name.localeCompare(b.name, "es") * mul;
    case "email":
      return a.email.localeCompare(b.email, "es") * mul;
    case "phone":
      return (a.phone ?? "").localeCompare(b.phone ?? "", "es") * mul;
    case "status":
      return a.status.localeCompare(b.status, "es") * mul;
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        u.membershipId.toLowerCase().includes(needle) ||
        (u.phone?.toLowerCase().includes(needle) ?? false),
    );
  }, [users, q]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareUsers(a, b, sortKey, sortDir));
    return copy;
  }, [filtered, sortKey, sortDir]);

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

  function cellValue(u: SafeUser, key: SortKey): React.ReactNode {
    switch (key) {
      case "membershipId":
        return (
          <span className="font-mono text-xs">{u.membershipId}</span>
        );
      case "name":
        return u.name;
      case "email":
        return u.email;
      case "phone":
        return <span className="text-muted">{u.phone ?? "—"}</span>;
      case "status":
        return <span className="capitalize">{u.status}</span>;
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
      <label className="mb-2 block text-sm text-muted" htmlFor="search">
        Buscar por nombre, email o número
      </label>
      <input
        id="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ej. CY0001 o nombre…"
        className="mb-6 w-full max-w-md rounded-xl border border-border bg-card px-4 py-2 text-[15px] outline-none ring-brand focus:ring-2"
      />

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
        Mostrando {sorted.length} de {users.length} socios.
      </p>
    </div>
  );
}
