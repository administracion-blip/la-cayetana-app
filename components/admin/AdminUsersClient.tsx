"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { QrScanIcon } from "@/components/icons/QrScanIcon";
import type { UserRecord } from "@/types/models";
import { AdminAuthDeniedDialog } from "./AdminAuthDeniedDialog";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import { QrScannerModal } from "./QrScannerModal";
import { ScanNoMatchDialog } from "./ScanNoMatchDialog";
import { UserQuickSheet } from "./UserQuickSheet";

/**
 * Extrae el número de socio (CY…) del texto de un QR. El QR del carnet contiene
 * hoy literalmente `CY0234`, pero si en el futuro se cambia a una URL del tipo
 * `https://.../socio/CY0234` esta función sigue funcionando.
 */
function extractMembershipId(raw: string): string {
  const match = raw.match(/CY\d{3,}/i);
  return match ? match[0].toUpperCase() : raw.trim().toUpperCase();
}

export type SafeUser = Omit<UserRecord, "passwordHash">;

type PendingConfirm =
  | null
  | { kind: "activate"; user: SafeUser }
  | { kind: "delivery"; user: SafeUser };

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
  membershipId: 78,
  name: 140,
  email: 180,
  phone: 96,
  sex: 90,
  birthYear: 64,
  status: 84,
  paidAmount: 76,
  deliveryStatus: 160,
  isAdmin: 56,
  createdAt: 124,
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

type QuickFilter = "all" | "pendingPayment" | "pendingDelivery";

export function AdminUsersClient({ users }: { users: SafeUser[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("membershipId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [widths, setWidths] = useState<Record<SortKey, number>>(() => ({
    ...DEFAULT_WIDTHS,
  }));
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [rows, setRows] = useState<SafeUser[]>(users);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  /** Socio cuyo bono se deshará tras escanear un carnet admin (autorización). */
  const [undoDeliveryTarget, setUndoDeliveryTarget] = useState<SafeUser | null>(
    null,
  );
  const [scannedUserId, setScannedUserId] = useState<string | null>(null);
  const [scanNoMatchCy, setScanNoMatchCy] = useState<string | null>(null);
  const [authDeniedOpen, setAuthDeniedOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);
  const [, startTransition] = useTransition();

  const sortColumnLabel = useMemo(
    () => COLUMNS.find((c) => c.key === sortKey)?.label ?? sortKey,
    [sortKey],
  );

  // La ficha se deriva de `rows` para reflejar actualizaciones (p.ej. tras
  // activar o marcar entregado la ficha muestra el nuevo estado sin cerrarse).
  const scannedUser = useMemo(
    () => (scannedUserId ? rows.find((u) => u.id === scannedUserId) ?? null : null),
    [rows, scannedUserId],
  );

  useEffect(() => {
    setRows(users);
  }, [users]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let base: SafeUser[];
    if (quickFilter === "pendingPayment") {
      base = rows.filter((u) => u.status === "pending_payment");
    } else if (quickFilter === "pendingDelivery") {
      base = rows.filter(
        (u) =>
          u.status === "active" &&
          (u.deliveryStatus ?? "pending") === "pending",
      );
    } else {
      base = rows;
    }
    if (!needle) return base;
    return base.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.membershipId?.toLowerCase().includes(needle) ?? false) ||
        (u.phone?.toLowerCase().includes(needle) ?? false),
    );
  }, [rows, q, quickFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareUsers(a, b, sortKey, sortDir));
    return copy;
  }, [filtered, sortKey, sortDir]);

  const pendingPaymentCount = useMemo(
    () => rows.filter((u) => u.status === "pending_payment").length,
    [rows],
  );
  const pendingDeliveryCount = useMemo(
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

  const runActivate = useCallback(async (user: SafeUser) => {
    setError(null);
    setPendingId(user.id);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            user?: {
              membershipId?: string | null;
              status?: "active" | "inactive" | "pending_payment";
              paidAt?: string | null;
              paidAmount?: number | null;
              deliveryStatus?: "pending" | "delivered";
              activatedAt?: string | null;
            };
          }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo activar al usuario");
        return;
      }
      startTransition(() => {
        setRows((prev) =>
          prev.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  entityType: "USER",
                  status: data.user?.status ?? "active",
                  membershipId: data.user?.membershipId ?? u.membershipId,
                  paidAt: data.user?.paidAt ?? u.paidAt,
                  paidAmount: data.user?.paidAmount ?? u.paidAmount ?? undefined,
                  deliveryStatus: data.user?.deliveryStatus ?? "pending",
                  activatedAt:
                    data.user?.activatedAt ?? u.activatedAt ?? undefined,
                }
              : u,
          ),
        );
      });
    } catch (e) {
      console.error(e);
      setError("Error de red al activar al usuario");
    } finally {
      setPendingId(null);
    }
  }, []);

  const requestActivate = useCallback((user: SafeUser) => {
    setPendingConfirm({ kind: "activate", user });
  }, []);

  const runDelivery = useCallback(
    async (
      user: SafeUser,
      action: "deliver" | "undo",
      authorizerUserId?: string,
    ) => {
      setError(null);
      setPendingId(user.id);
      try {
        const body =
          action === "deliver"
            ? { action: "deliver" as const }
            : {
                action: "undo" as const,
                authorizerUserId: authorizerUserId ?? "",
              };
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(user.id)}/delivery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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
          if (res.status === 403) {
            setAuthDeniedOpen(true);
          } else {
            setError(data?.error ?? "No se pudo actualizar la entrega");
          }
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

  const requestDelivery = useCallback(
    (user: SafeUser, action: "deliver" | "undo") => {
      if (action === "undo") {
        setUndoDeliveryTarget(user);
        setScannerOpen(true);
        return;
      }
      setPendingConfirm({ kind: "delivery", user });
    },
    [],
  );

  const handleScanResult = useCallback(
    (raw: string) => {
      setScannerOpen(false);
      const cy = extractMembershipId(raw);

      if (undoDeliveryTarget) {
        const target = undoDeliveryTarget;
        setUndoDeliveryTarget(null);
        const authorizer = rows.find(
          (u) => (u.membershipId ?? "").toUpperCase() === cy,
        );
        if (!authorizer) {
          setScanNoMatchCy(cy);
          return;
        }
        if (!authorizer.isAdmin) {
          setAuthDeniedOpen(true);
          return;
        }
        void runDelivery(target, "undo", authorizer.id);
        return;
      }

      const found = rows.find(
        (u) => (u.membershipId ?? "").toUpperCase() === cy,
      );
      if (!found) {
        setScanNoMatchCy(cy);
        return;
      }
      setQ(cy);
      setScannedUserId(found.id);
    },
    [rows, undoDeliveryTarget, runDelivery],
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
      case "status": {
        if (u.status === "pending_payment") {
          const busy = pendingId === u.id;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                Pendiente pago
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => requestActivate(u)}
                className="rounded-md bg-brand px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                title="Confirmar pago y activar socio"
              >
                {busy ? "…" : "Activar"}
              </button>
            </div>
          );
        }
        if (u.status === "inactive") {
          const busy = pendingId === u.id;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                Inactivo
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => requestActivate(u)}
                className="rounded-md bg-brand px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                title="Confirmar pago y activar socio"
              >
                {busy ? "…" : "Activar"}
              </button>
            </div>
          );
        }
        // active: botón "Renovar" = misma activación manual, refresca paidAt.
        const busy = pendingId === u.id;
        const currentYear = new Date().getUTCFullYear();
        const paidThisYear =
          u.paidAt && new Date(u.paidAt).getUTCFullYear() === currentYear;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Activo
            </span>
            {!paidThisYear ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => requestActivate(u)}
                className="rounded-md border border-border bg-white px-2 py-0.5 text-xs text-foreground hover:bg-zinc-50 disabled:opacity-50"
                title="Confirmar renovación de este año"
              >
                {busy ? "…" : "Renovar"}
              </button>
            ) : null}
          </div>
        );
      }
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
                onClick={() => requestDelivery(u, "undo")}
                className="rounded-md border border-border bg-white px-2 py-0.5 text-xs text-foreground hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy ? "…" : "Deshacer"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => requestDelivery(u, "deliver")}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUndoDeliveryTarget(null);
                setScannerOpen(true);
              }}
              className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl border border-teal-200 bg-teal-100 px-4 py-2.5 text-sm font-semibold text-teal-900 shadow-sm ring-1 ring-teal-300/40 transition-colors hover:bg-teal-200/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
              aria-label="Escanear QR de socio"
              title="Abrir cámara y escanear el carnet"
            >
              <QrScanIcon className="h-5 w-5 text-teal-700" />
              Escanear
            </button>
            <input
              id="search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej. CY0001 o nombre…"
              className="w-full max-w-md rounded-xl border border-border bg-card px-4 py-2 text-[15px] outline-none ring-brand focus:ring-2"
            />
          </div>
        </div>
        <div className="-mx-1 flex max-w-full flex-nowrap items-stretch gap-1 overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card p-1 text-xs sm:mx-0 sm:text-sm [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => setQuickFilter("all")}
            className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 sm:px-3 ${
              quickFilter === "all"
                ? "bg-brand text-white"
                : "text-muted hover:bg-zinc-50"
            }`}
          >
            Todos
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] sm:ml-2 sm:px-2 sm:text-xs ${
                quickFilter === "all"
                  ? "bg-white/20 text-white"
                  : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {rows.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter("pendingPayment")}
            className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 sm:px-3 ${
              quickFilter === "pendingPayment"
                ? "bg-amber-600 text-white"
                : "text-muted hover:bg-zinc-50"
            }`}
            title="Drafts esperando validación manual del pago"
          >
            <span className="sm:hidden">P. pago</span>
            <span className="hidden sm:inline">Pendientes de pago</span>
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] sm:ml-2 sm:px-2 sm:text-xs ${
                quickFilter === "pendingPayment"
                  ? "bg-white/20 text-white"
                  : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
              }`}
            >
              {pendingPaymentCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter("pendingDelivery")}
            className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 sm:px-3 ${
              quickFilter === "pendingDelivery"
                ? "bg-emerald-700 text-white"
                : "text-muted hover:bg-zinc-50"
            }`}
            title="Socios activos cuyo bono aún no se ha entregado"
          >
            <span className="sm:hidden">P. entrega</span>
            <span className="hidden sm:inline">Pendientes de entrega</span>
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] sm:ml-2 sm:px-2 sm:text-xs ${
                quickFilter === "pendingDelivery"
                  ? "bg-white/20 text-white"
                  : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
              }`}
            >
              {pendingDeliveryCount}
            </span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-3 lg:hidden">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            type="button"
            id="admin-users-sort-toggle"
            aria-expanded={mobileSortOpen}
            aria-controls="admin-users-sort-panel"
            onClick={() => setMobileSortOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-zinc-50"
          >
            <span className="min-w-0 font-medium">
              <span className="text-muted">Ordenar por · </span>
              <span className="text-foreground">
                {sortColumnLabel}
                {sortDir === "asc" ? " · asc" : " · desc"}
              </span>
            </span>
            <span
              className={`shrink-0 text-muted transition-transform duration-200 ${
                mobileSortOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          <div
            id="admin-users-sort-panel"
            role="region"
            aria-labelledby="admin-users-sort-toggle"
            className={
              mobileSortOpen
                ? "border-t border-border px-3 pb-3 pt-2"
                : "hidden"
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="admin-users-sort" className="sr-only">
                Columna de ordenación
              </label>
              <select
                id="admin-users-sort"
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value as SortKey);
                  setSortDir("asc");
                  setMobileSortOpen(false);
                }}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-brand focus:ring-2 sm:max-w-xs"
              >
                {COLUMNS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  setMobileSortOpen(false);
                }}
                className="shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-zinc-50"
                aria-label={
                  sortDir === "asc"
                    ? "Cambiar a orden descendente"
                    : "Cambiar a orden ascendente"
                }
                title={sortDir === "asc" ? "Descendente" : "Ascendente"}
              >
                {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {sorted.map((u) => (
          <article
            key={u.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="font-mono text-xs text-muted">
              {cellValue(u, "membershipId")}
            </p>
            <h3 className="mt-1 text-base font-semibold leading-snug text-foreground">
              {cellValue(u, "name")}
            </h3>
            <p className="mt-1 break-all text-sm text-muted">
              {cellValue(u, "email")}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Teléfono</dt>
                <dd className="mt-0.5">{cellValue(u, "phone")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Importe</dt>
                <dd className="mt-0.5">{cellValue(u, "paidAmount")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Sexo</dt>
                <dd className="mt-0.5">{cellValue(u, "sex")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Año nac.</dt>
                <dd className="mt-0.5">{cellValue(u, "birthYear")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Admin</dt>
                <dd className="mt-0.5">{cellValue(u, "isAdmin")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Alta</dt>
                <dd className="mt-0.5">{cellValue(u, "createdAt")}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Estado
                </p>
                {cellValue(u, "status")}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Entrega
                </p>
                {cellValue(u, "deliveryStatus")}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table
          className="text-left text-xs"
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
                    className="flex w-full items-center gap-1 px-2 py-1.5 pr-3 text-left hover:bg-zinc-100/80"
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
                    className="px-2 py-1.5 align-top"
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
        {quickFilter === "pendingPayment"
          ? " (solo pendientes de pago)"
          : quickFilter === "pendingDelivery"
            ? " (solo pendientes de entrega)"
            : ""}
        .
      </p>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => {
          setUndoDeliveryTarget(null);
          setScannerOpen(false);
        }}
        onResult={handleScanResult}
        title={
          undoDeliveryTarget
            ? "Autorizar deshacer entrega"
            : "Escanear QR de socio"
        }
        hint={
          undoDeliveryTarget
            ? "Escanea el carnet de un usuario administrador"
            : "Apunta la cámara al QR del carnet del socio"
        }
      />

      <UserQuickSheet
        user={scannedUser}
        busy={!!scannedUser && pendingId === scannedUser.id}
        backdropPointerEventsNone={
          pendingConfirm !== null || authDeniedOpen
        }
        onClose={() => setScannedUserId(null)}
        onActivate={requestActivate}
        onDelivery={requestDelivery}
      />

      {pendingConfirm?.kind === "activate" ? (
        <AdminConfirmDialog
          title={
            pendingConfirm.user.status === "pending_payment"
              ? "Activar socio"
              : "Renovar"
          }
          confirmLabel={
            pendingConfirm.user.status === "pending_payment"
              ? "Activar"
              : "Confirmar renovación"
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const u = pendingConfirm.user;
            setPendingConfirm(null);
            window.setTimeout(() => {
              void runActivate(u);
            }, 0);
          }}
        >
          {pendingConfirm.user.status === "pending_payment" ? (
            <>
              ¿Confirmas el pago y activas a{" "}
              <strong className="text-foreground">{pendingConfirm.user.name}</strong>
              ? Se le asignará un carnet (CY) y podrá iniciar sesión.
            </>
          ) : (
            <>
              ¿Confirmas la renovación de{" "}
              <strong className="text-foreground">{pendingConfirm.user.name}</strong>
              ? Se actualizará la fecha de pago de este año.
              {pendingConfirm.user.paidAt ? (
                <>
                  {" "}
                  Último pago registrado:{" "}
                  <span className="text-foreground">
                    {new Date(pendingConfirm.user.paidAt).toLocaleDateString(
                      "es-ES",
                    )}
                  </span>
                  .
                </>
              ) : null}
            </>
          )}
        </AdminConfirmDialog>
      ) : pendingConfirm?.kind === "delivery" ? (
        <AdminConfirmDialog
          title="Marcar bono como entregado"
          confirmLabel="Marcar entregado"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const { user } = pendingConfirm;
            setPendingConfirm(null);
            window.setTimeout(() => {
              void runDelivery(user, "deliver");
            }, 0);
          }}
        >
          ¿Marcar como entregado el bono de{" "}
          <strong className="text-foreground">{pendingConfirm.user.name}</strong>?
        </AdminConfirmDialog>
      ) : null}

      {authDeniedOpen ? (
        <AdminAuthDeniedDialog onDismiss={() => setAuthDeniedOpen(false)} />
      ) : null}

      {scanNoMatchCy ? (
        <ScanNoMatchDialog
          membershipId={scanNoMatchCy}
          onDismiss={() => setScanNoMatchCy(null)}
        />
      ) : null}
    </div>
  );
}
