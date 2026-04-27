"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { CSSProperties } from "react";
import { QrScanIcon } from "@/components/icons/QrScanIcon";
import {
  bonoDeliveryBlockReason,
  userCanReceiveBonoDelivery,
  userHasPaidThisYear,
} from "@/lib/membership";
import { getSociosDemographicsStats } from "@/lib/admin/socios-demographics";
import type { UserRecord } from "@/types/models";
import { ActivateUserDialog } from "./ActivateUserDialog";
import { AdminAuthDeniedDialog } from "./AdminAuthDeniedDialog";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import { EditUserProfileModal } from "./EditUserProfileModal";
import { InviteMemberModal } from "./InviteMemberModal";
import { QrScannerModal } from "./QrScannerModal";
import { ScanNoMatchDialog } from "./ScanNoMatchDialog";
import { UserPermissionsModal } from "./UserPermissionsModal";
import { SociosDemographicsCard } from "./SociosDemographicsCard";
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
  | { kind: "delivery"; user: SafeUser }
  | { kind: "bulkDeliver"; users: SafeUser[] }
  | { kind: "bulkActivate"; users: SafeUser[] }
  | { kind: "deactivate"; user: SafeUser };

type InviteFeedback = {
  email: string;
  emailSent: boolean;
  inviteUrl?: string;
} | null;

/**
 * Activo, con renovación al día (paidAt en el año en curso) y bono aún
 * pendiente. Es la misma condición del botón “Marcar entregado” por fila.
 */
function canBulkDeliver(u: SafeUser): boolean {
  return (
    userCanReceiveBonoDelivery(u) &&
    (u.deliveryStatus ?? "pending") === "pending"
  );
}

/** Misma lógica que los botones Activar / Renovar por fila. */
function canBulkActivate(u: SafeUser): boolean {
  if (u.status === "pending_payment" || u.status === "inactive") return true;
  if (u.status === "active") {
    return !userHasPaidThisYear(u);
  }
  return false;
}

type SortKey =
  | "membershipId"
  | "name"
  | "email"
  | "phone"
  | "sex"
  | "birthYear"
  | "status"
  | "paidAmount"
  | "paidAt"
  | "deliveryStatus"
  | "isAdmin"
  | "canValidatePrizes"
  | "createdAt"
  | "permissions"
  | "userActions";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "membershipId", label: "Socio" },
  { key: "name", label: "Nombre" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
  { key: "sex", label: "Sexo" },
  { key: "birthYear", label: "Año nac." },
  { key: "status", label: "Estado" },
  { key: "paidAmount", label: "Importe" },
  { key: "paidAt", label: "F. pago" },
  { key: "deliveryStatus", label: "Entrega" },
  { key: "isAdmin", label: "Admin" },
  { key: "canValidatePrizes", label: "Validador" },
  { key: "createdAt", label: "Alta" },
  { key: "permissions", label: "Permisos" },
  { key: "userActions", label: "Acciones" },
];

const DEFAULT_WIDTHS: Record<SortKey, number> = {
  membershipId: 72,
  name: 128,
  email: 156,
  phone: 88,
  sex: 80,
  birthYear: 58,
  status: 78,
  paidAmount: 70,
  paidAt: 96,
  deliveryStatus: 138,
  isAdmin: 52,
  canValidatePrizes: 100,
  createdAt: 108,
  permissions: 80,
  userActions: 150,
};

const SEX_LABEL: Record<string, string> = {
  male: "Hombre",
  female: "Mujer",
  prefer_not_to_say: "Prefiero no decirlo",
};

const MIN_COL = 56;

/** Ancho columna checkbox (w-9 + padding); base para `left` de Socio / Nombre sticky. */
const STICKY_CHECKBOX_COL_PX = 40;

const EUR_FORMAT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

/**
 * `paidAmount` se persiste ya en EUROS (50 = 50,00 €), por lo que aquí solo
 * formateamos. Los valores Stripe (céntimos) se convierten en el repositorio
 * antes de guardar en Dynamo.
 */
function formatEuros(amount: number | undefined | null): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "—";
  return EUR_FORMAT.format(amount);
}

function deliveryRank(u: SafeUser): number {
  if (u.status !== "active") return 2;
  return u.deliveryStatus === "delivered" ? 1 : 0;
}

function permissionScore(u: SafeUser): number {
  let n = 0;
  if (u.isAdmin) n++;
  if (u.canEditUserPermissions) n++;
  if (u.canAccessAdmin) n++;
  if (u.canAccessAdminSocios) n++;
  if (u.canManageSociosActions) n++;
  if (u.canAccessAdminReservas) n++;
  if (u.canAccessAdminProgramacion) n++;
  if (u.canValidatePrizes) n++;
  if (u.canEditRouletteConfig) n++;
  if (u.canViewRouletteOps) n++;
  if (u.canManageReservations) n++;
  if (u.canReplyReservationChats) n++;
  if (u.canEditReservationConfig) n++;
  if (u.canManageReservationDocuments) n++;
  if (u.canWriteReservationNotes) n++;
  return n;
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
    case "paidAt": {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return (ta - tb) * mul;
    }
    case "deliveryStatus":
      return (deliveryRank(a) - deliveryRank(b)) * mul;
    case "isAdmin": {
      const va = a.isAdmin ? 1 : 0;
      const vb = b.isAdmin ? 1 : 0;
      return (va - vb) * mul;
    }
    case "canValidatePrizes": {
      const va = a.canValidatePrizes ? 1 : 0;
      const vb = b.canValidatePrizes ? 1 : 0;
      return (va - vb) * mul;
    }
    case "createdAt":
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mul
      );
    case "permissions":
      return (permissionScore(a) - permissionScore(b)) * mul;
    case "userActions":
      return 0;
    default:
      return 0;
  }
}

type QuickFilter = "all" | "pendingPayment" | "pendingDelivery";

export function AdminUsersClient({
  users,
  currentUser,
}: {
  users: SafeUser[];
  currentUser: SafeUser;
}) {
  const canManageUsersFully =
    currentUser.isAdmin === true ||
    currentUser.canManageSociosActions === true;
  const canEditPermissionsUI =
    currentUser.isAdmin === true ||
    currentUser.canEditUserPermissions === true;
  const canInvite =
    currentUser.isAdmin === true || currentUser.canInviteSocios === true;
  const canEditProfile =
    currentUser.isAdmin === true || currentUser.canEditSociosProfile === true;
  const canDeactivate =
    currentUser.isAdmin === true || currentUser.canDeactivateSocios === true;

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [permissionsUser, setPermissionsUser] = useState<SafeUser | null>(null);
  const [editProfileUser, setEditProfileUser] = useState<SafeUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const visibleColumns = useMemo(
    () =>
      COLUMNS.filter((c) => {
        if (c.key === "permissions" && !canEditPermissionsUI) return false;
        if (c.key === "userActions" && !canEditProfile && !canDeactivate) {
          return false;
        }
        return true;
      }),
    [canEditPermissionsUI, canEditProfile, canDeactivate],
  );

  const sortColumnLabel = useMemo(
    () => visibleColumns.find((c) => c.key === sortKey)?.label ?? sortKey,
    [visibleColumns, sortKey],
  );

  const stickyLeftBase = canManageUsersFully
    ? STICKY_CHECKBOX_COL_PX
    : 0;
  const stickyNameColLeft = stickyLeftBase + widths.membershipId;

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

  const tableDemographicsStats = useMemo(
    () => getSociosDemographicsStats(sorted),
    [sorted],
  );

  const selectedInViewCount = useMemo(
    () => sorted.filter((u) => selectedIds.has(u.id)).length,
    [sorted, selectedIds],
  );

  const selectedUsers = useMemo(
    () => rows.filter((u) => selectedIds.has(u.id)),
    [rows, selectedIds],
  );

  const bulkDeliverCandidates = useMemo(
    () => selectedUsers.filter(canBulkDeliver),
    [selectedUsers],
  );

  const bulkActivateCandidates = useMemo(
    () => selectedUsers.filter(canBulkActivate),
    [selectedUsers],
  );

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate =
      selectedInViewCount > 0 && selectedInViewCount < sorted.length;
  }, [selectedInViewCount, sorted.length]);

  /** Selección masiva solo en tablet y escritorio (≥ md); en teléfono se limpia al redimensionar. */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const clearIfPhone = () => {
      if (!mq.matches) setSelectedIds(new Set());
    };
    clearIfPhone();
    mq.addEventListener("change", clearIfPhone);
    return () => mq.removeEventListener("change", clearIfPhone);
  }, []);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    const ids = sorted.map((u) => u.id);
    setSelectedIds((prev) => {
      const allSelected =
        ids.length > 0 && ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [sorted]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

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

  const runActivate = useCallback(
    async (
      user: SafeUser,
      opts?: { paidAmountEuros?: number | null },
    ): Promise<boolean> => {
    setError(null);
    setPendingId(user.id);
    try {
      // Si el admin deja el campo vacío (`null`) no enviamos el campo al API
      // para mantener el comportamiento previo (no registrar importe). Si
      // lo escribió (incluido 0), se envía explícitamente.
      const body: Record<string, number> = {};
      if (typeof opts?.paidAmountEuros === "number") {
        body.paidAmountEuros = opts.paidAmountEuros;
      }
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/activate`,
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
        return false;
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
      return true;
    } catch (e) {
      console.error(e);
      setError("Error de red al activar al usuario");
      return false;
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
    ): Promise<boolean> => {
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
          return false;
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
        return true;
      } catch (e) {
        console.error(e);
        setError("Error de red al actualizar la entrega");
        return false;
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

  const runBulkDeliver = useCallback(
    async (users: SafeUser[]) => {
      let ok = 0;
      let fail = 0;
      for (const u of users) {
        const success = await runDelivery(u, "deliver");
        if (success) ok++;
        else fail++;
      }
      if (fail > 0 && ok === 0) {
        setError(
          "No se pudo completar la entrega masiva. Revisa el mensaje anterior.",
        );
      } else if (fail > 0) {
        setError(`Entrega masiva: ${ok} correcto(s), ${fail} fallido(s).`);
      }
      clearSelection();
    },
    [runDelivery, clearSelection],
  );

  const runBulkActivate = useCallback(
    async (users: SafeUser[]) => {
      let ok = 0;
      let fail = 0;
      for (const u of users) {
        const success = await runActivate(u);
        if (success) ok++;
        else fail++;
      }
      if (fail > 0 && ok === 0) {
        setError(
          "No se pudo completar la activación masiva. Revisa el mensaje anterior.",
        );
      } else if (fail > 0) {
        setError(`Activación masiva: ${ok} correcto(s), ${fail} fallido(s).`);
      }
      clearSelection();
    },
    [runActivate, clearSelection],
  );

  const runDeactivate = useCallback(
    async (user: SafeUser): Promise<boolean> => {
      setError(null);
      setPendingId(user.id);
      try {
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(user.id)}/deactivate`,
          { method: "POST" },
        );
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              user?: {
                id: string;
                status: "active" | "inactive" | "pending_payment";
                deactivatedAt?: string | null;
                deactivatedByUserId?: string | null;
              };
            }
          | null;
        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "No se pudo dar de baja al socio");
          return false;
        }
        startTransition(() => {
          setRows((prev) =>
            prev.map((u) =>
              u.id === user.id
                ? {
                    ...u,
                    status: data.user?.status ?? "inactive",
                    deactivatedAt: data.user?.deactivatedAt ?? undefined,
                    deactivatedByUserId:
                      data.user?.deactivatedByUserId ?? undefined,
                  }
                : u,
            ),
          );
        });
        return true;
      } catch (e) {
        console.error(e);
        setError("Error de red al dar de baja al socio");
        return false;
      } finally {
        setPendingId(null);
      }
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
        if (!authorizer.isAdmin && !authorizer.canManageSociosActions) {
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
          <span className="font-mono text-[10px] leading-tight">
            {u.membershipId ?? "—"}
          </span>
        );
      case "name":
        return (
          <span
            className="block min-w-0 max-w-full truncate"
            title={u.name}
          >
            {u.name}
          </span>
        );
      case "email":
        return (
          <span
            className="block min-w-0 max-w-full truncate text-muted"
            title={u.email}
          >
            {u.email}
          </span>
        );
      case "phone":
        return (
          <span
            className="block min-w-0 max-w-full truncate text-muted"
            title={u.phone ?? undefined}
          >
            {u.phone ?? "—"}
          </span>
        );
      case "sex":
        return (
          <span className="text-muted">
            {u.sex ? SEX_LABEL[u.sex] ?? u.sex : "—"}
          </span>
        );
      case "birthYear":
        return (
          <span className="font-mono text-[10px] leading-tight text-muted">
            {u.birthYear ?? "—"}
          </span>
        );
      case "status": {
        if (u.status === "pending_payment") {
          const busy = pendingId === u.id;
          if (!canManageUsersFully) {
            return (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-700 ring-1 ring-inset ring-amber-200">
                Pendiente pago
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-700 ring-1 ring-inset ring-amber-200">
                Pendiente pago
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => requestActivate(u)}
                className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white hover:bg-brand-hover disabled:opacity-50"
                title="Confirmar pago y activar socio"
              >
                {busy ? "…" : "Activar"}
              </button>
            </div>
          );
        }
        if (u.status === "inactive") {
          const busy = pendingId === u.id;
          if (!canManageUsersFully) {
            return (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-zinc-700 ring-1 ring-inset ring-zinc-200">
                Inactivo
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-zinc-700 ring-1 ring-inset ring-zinc-200">
                Inactivo
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => requestActivate(u)}
                className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white hover:bg-brand-hover disabled:opacity-50"
                title="Confirmar pago y activar socio"
              >
                {busy ? "…" : "Activar"}
              </button>
            </div>
          );
        }
        // active: botón "Renovar" = misma activación manual, refresca paidAt.
        const busy = pendingId === u.id;
        const paidThisYear = userHasPaidThisYear(u);
        if (!canManageUsersFully) {
          return (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Activo
            </span>
          );
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Activo
            </span>
            {!paidThisYear ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => requestActivate(u)}
                className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] leading-tight text-foreground hover:bg-zinc-50 disabled:opacity-50"
                title="Confirmar renovación de este año"
              >
                {busy ? "…" : "Renovar"}
              </button>
            ) : null}
          </div>
        );
      }
      case "paidAmount": {
        const amount = u.paidAmount;
        const n =
          typeof amount === "number" && !Number.isNaN(amount) ? amount : null;
        const isPositive = n != null && n > 0;
        return (
          <span
            className={
              isPositive
                ? "whitespace-nowrap font-mono text-[10px] font-bold leading-tight"
                : "whitespace-nowrap font-mono text-[10px] leading-tight text-muted"
            }
          >
            {formatEuros(u.paidAmount)}
          </span>
        );
      }
      case "paidAt": {
        if (!u.paidAt) {
          return <span className="text-muted">—</span>;
        }
        const dt = new Date(u.paidAt);
        if (Number.isNaN(dt.getTime())) {
          return <span className="text-muted">—</span>;
        }
        const dateStr = dt.toLocaleDateString("es-ES");
        return (
          <span
            className="whitespace-nowrap font-mono text-[10px] leading-tight text-muted"
            title={dt.toLocaleString("es-ES")}
          >
            {dateStr}
          </span>
        );
      }
      case "deliveryStatus": {
        if (u.status !== "active") {
          return <span className="text-muted">—</span>;
        }
        const delivered = u.deliveryStatus === "delivered";
        const busy = pendingId === u.id;
        const blockReason = bonoDeliveryBlockReason(u);
        const canDeliver = blockReason === null;
        if (!canManageUsersFully) {
          return delivered ? (
            <span
              className="inline-flex max-w-full items-center rounded-full bg-emerald-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-emerald-700 ring-1 ring-inset ring-emerald-200"
              title={
                u.deliveredAt
                  ? `Entregado ${new Date(u.deliveredAt).toLocaleString("es-ES")}`
                  : "Entregado"
              }
            >
              <span className="truncate">Entregado</span>
              {u.deliveredAt ? (
                <span className="ml-0.5 shrink-0 font-normal text-emerald-600">
                  {new Date(u.deliveredAt).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-700 ring-1 ring-inset ring-amber-200">
              Pendiente
            </span>
          );
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            {delivered ? (
              <span
                className="inline-flex max-w-full items-center rounded-full bg-emerald-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-emerald-700 ring-1 ring-inset ring-emerald-200"
                title={
                  u.deliveredAt
                    ? `Entregado ${new Date(u.deliveredAt).toLocaleString("es-ES")}`
                    : "Entregado"
                }
              >
                <span className="truncate">Entregado</span>
                {u.deliveredAt ? (
                  <span className="ml-0.5 shrink-0 font-normal text-emerald-600">
                    {new Date(u.deliveredAt).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-700 ring-1 ring-inset ring-amber-200">
                Pendiente
              </span>
            )}
            {delivered ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => requestDelivery(u, "undo")}
                className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] leading-tight text-foreground hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy ? "…" : "Deshacer"}
              </button>
            ) : canDeliver ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => requestDelivery(u, "deliver")}
                className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white hover:bg-emerald-700 disabled:opacity-50"
                title="Marcar bono como entregado al socio"
              >
                {busy ? "…" : "Marcar entregado"}
              </button>
            ) : blockReason === "no_payment_amount" ? (
              <span
                className="text-[10px] leading-tight text-muted"
                title="No hay importe registrado en este pago. Edita el importe (o renueva con el cobro) antes de entregar el bono."
              >
                Sin importe
              </span>
            ) : (
              <span
                className="text-[10px] leading-tight text-muted"
                title="El socio no ha renovado este año. Renueva primero."
              >
                Renueva primero
              </span>
            )}
          </div>
        );
      }
      case "isAdmin":
        return (
          <span className="text-muted">{u.isAdmin ? "Sí" : "—"}</span>
        );
      case "canValidatePrizes": {
        if (u.status !== "active") {
          return <span className="text-muted">—</span>;
        }
        return (
          <span className="text-muted" title="Cambiar en Editar permisos">
            {u.canValidatePrizes ? "Sí" : "No"}
          </span>
        );
      }
      case "createdAt":
        return (
          <span
            className="block min-w-0 max-w-full truncate text-[10px] text-muted"
            title={new Date(u.createdAt).toLocaleString("es-ES")}
          >
            {new Date(u.createdAt).toLocaleString("es-ES")}
          </span>
        );
      case "permissions": {
        if (!canEditPermissionsUI) {
          return <span className="text-muted">—</span>;
        }
        const busy = pendingId === u.id;
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => setPermissionsUser(u)}
            className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] font-medium leading-tight text-foreground hover:bg-zinc-50 disabled:opacity-50"
            title="Gestionar permisos (admin, validador, reservas…)"
          >
            Editar
          </button>
        );
      }
      case "userActions": {
        if (!canEditProfile && !canDeactivate) {
          return <span className="text-muted">—</span>;
        }
        const busy = pendingId === u.id;
        const isInactive = u.status === "inactive";
        return (
          <div className="flex flex-wrap items-center gap-1">
            {canEditProfile ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditProfileUser(u)}
                className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] font-medium leading-tight text-foreground hover:bg-zinc-50 disabled:opacity-50"
                title="Editar nombre, teléfono, sexo y año de nacimiento"
              >
                Ficha
              </button>
            ) : null}
            {canDeactivate && !isInactive ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setPendingConfirm({ kind: "deactivate", user: u })
                }
                className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                title="Marcar como inactivo (baja lógica). Se puede reactivar."
              >
                Baja
              </button>
            ) : null}
          </div>
        );
      }
      default:
        return null;
    }
  }

  const allVisibleSelected =
    sorted.length > 0 && selectedInViewCount === sorted.length;

  return (
    <div>
      <SociosDemographicsCard stats={tableDemographicsStats} />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[260px]">
          <label className="mb-2 block text-sm text-muted" htmlFor="search">
            Buscar por nombre, email o número
          </label>
          <div className="flex items-center gap-2">
            {canManageUsersFully ? (
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
            ) : null}
            {canInvite ? (
              <button
                type="button"
                onClick={() => {
                  setInviteFeedback(null);
                  setInviteOpen(true);
                }}
                className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl border border-brand/30 bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                title="Enviar invitación a un nuevo socio (sin Stripe)"
              >
                + Invitar
              </button>
            ) : null}
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

      {canManageUsersFully && selectedUsers.length > 0 ? (
        <div className="mb-4 hidden flex-col gap-2 rounded-xl border border-brand/25 bg-brand/5 px-3 py-2.5 text-sm md:flex sm:flex-row sm:flex-wrap sm:items-center">
          <span className="font-medium text-foreground">
            {selectedUsers.length}{" "}
            {selectedUsers.length === 1
              ? "socio seleccionado"
              : "socios seleccionados"}
          </span>
          <span className="text-muted">
            ({selectedInViewCount} en la vista actual)
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                bulkDeliverCandidates.length === 0 || pendingId !== null
              }
              onClick={() =>
                setPendingConfirm({
                  kind: "bulkDeliver",
                  users: bulkDeliverCandidates,
                })
              }
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Marcar entregado ({bulkDeliverCandidates.length})
            </button>
            <button
              type="button"
              disabled={
                bulkActivateCandidates.length === 0 || pendingId !== null
              }
              onClick={() =>
                setPendingConfirm({
                  kind: "bulkActivate",
                  users: bulkActivateCandidates,
                })
              }
              className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Activar / renovar ({bulkActivateCandidates.length})
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-zinc-50"
            >
              Quitar selección
            </button>
          </div>
          <p className="w-full text-xs text-muted">
            «Marcar entregado» y «Activar / renovar» solo afectan a los
            seleccionados que cumplan las condiciones de cada acción (igual que
            los botones en cada fila).
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {inviteFeedback ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="min-w-0 flex-1">
            {inviteFeedback.emailSent ? (
              <p>
                Invitación enviada a{" "}
                <strong className="font-mono">{inviteFeedback.email}</strong>.
                El enlace caduca en 7 días.
              </p>
            ) : (
              <>
                <p>
                  Se ha generado la invitación para{" "}
                  <strong className="font-mono">{inviteFeedback.email}</strong>{" "}
                  pero no se pudo enviar el email. Copia el enlace y compártelo
                  manualmente:
                </p>
                {inviteFeedback.inviteUrl ? (
                  <code className="mt-1 block break-all rounded bg-white/70 px-2 py-1 text-xs">
                    {inviteFeedback.inviteUrl}
                  </code>
                ) : null}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInviteFeedback(null)}
            className="shrink-0 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
            Cerrar
          </button>
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
                {visibleColumns.map(({ key, label }) => (
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

        <div className="space-y-3 lg:hidden text-[13px] leading-snug">
        {sorted.map((u) => (
          <article
            key={u.id}
            className="rounded-xl border border-border bg-card p-3.5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(u.id)}
                onChange={() => toggleSelectOne(u.id)}
                className={`mt-1 h-4 w-4 shrink-0 accent-brand ${canManageUsersFully ? "hidden md:block" : "hidden"}`}
                aria-label={`Seleccionar ${u.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] text-muted">
                  {cellValue(u, "membershipId")}
                </p>
                <h3 className="mt-0.5 text-sm font-semibold leading-tight text-foreground">
                  {cellValue(u, "name")}
                </h3>
                <p
                  className="mt-0.5 line-clamp-2 break-all text-xs text-muted"
                  title={u.email}
                >
                  {cellValue(u, "email")}
                </p>
              </div>
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
              <div>
                <dt className="text-xs text-muted">Teléfono</dt>
                <dd className="mt-0.5">{cellValue(u, "phone")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Importe</dt>
                <dd className="mt-0.5">{cellValue(u, "paidAmount")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">F. pago</dt>
                <dd className="mt-0.5">{cellValue(u, "paidAt")}</dd>
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
            {canEditPermissionsUI ? (
              <button
                type="button"
                onClick={() => setPermissionsUser(u)}
                className="mt-2.5 w-full rounded-xl border border-border py-2 text-xs font-medium text-foreground hover:bg-zinc-50"
              >
                Editar permisos
              </button>
            ) : null}
            {canEditProfile || canDeactivate ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {canEditProfile ? (
                  <button
                    type="button"
                    onClick={() => setEditProfileUser(u)}
                    className="flex-1 rounded-xl border border-border bg-white py-2 text-xs font-medium text-foreground hover:bg-zinc-50"
                  >
                    Editar ficha
                  </button>
                ) : null}
                {canDeactivate && u.status !== "inactive" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingConfirm({ kind: "deactivate", user: u })
                    }
                    className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-medium text-rose-800 hover:bg-rose-100"
                  >
                    Dar de baja
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table
          className="text-left text-[11px] leading-tight"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <thead className="border-b border-border bg-zinc-50">
            <tr>
              {canManageUsersFully ? (
                <th
                  scope="col"
                  style={{ width: STICKY_CHECKBOX_COL_PX, minWidth: STICKY_CHECKBOX_COL_PX }}
                  className="sticky left-0 z-30 border-r border-border/80 bg-zinc-50 px-0.5 py-1 align-middle font-medium shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                >
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    disabled={sorted.length === 0}
                    className="h-4 w-4 accent-brand disabled:opacity-40"
                    aria-label="Seleccionar todos los socios visibles en la tabla"
                    title="Seleccionar o deseleccionar la vista actual"
                  />
                </th>
              ) : null}
              {visibleColumns.map(({ key, label }) => {
                const isStickySocio = key === "membershipId";
                const isStickyName = key === "name";
                const stickyTh =
                  isStickySocio
                    ? "relative sticky z-20 border-r border-border/60 bg-zinc-50 shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                    : isStickyName
                      ? "relative sticky z-20 border-r border-border bg-zinc-50 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]"
                      : "relative";
                const thStyle: CSSProperties = {
                  width: widths[key],
                  ...(isStickySocio
                    ? { left: stickyLeftBase }
                    : isStickyName
                      ? { left: stickyNameColLeft }
                      : {}),
                };
                return (
                <th
                  key={key}
                  scope="col"
                  style={thStyle}
                  className={`px-0 py-0 font-medium ${stickyTh}`}
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
                    className="flex w-full items-center gap-0.5 px-1.5 py-1 pr-2 text-left hover:bg-zinc-100/80"
                    onClick={() => onHeaderClick(key)}
                  >
                    <span className="truncate text-[11px] font-medium leading-tight">
                      {label}
                    </span>
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
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                {canManageUsersFully ? (
                  <td
                    style={{ width: STICKY_CHECKBOX_COL_PX, minWidth: STICKY_CHECKBOX_COL_PX }}
                    className="sticky left-0 z-30 border-r border-border/80 bg-white px-0.5 py-1 align-top shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelectOne(u.id)}
                      className="h-3.5 w-3.5 accent-brand"
                      aria-label={`Seleccionar ${u.name}`}
                    />
                  </td>
                ) : null}
                {visibleColumns.map(({ key }) => {
                  const isStickySocio = key === "membershipId";
                  const isStickyName = key === "name";
                  const stickyTd =
                    isStickySocio
                      ? "sticky z-20 border-r border-border/60 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                      : isStickyName
                        ? "sticky z-20 border-r border-border bg-white shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]"
                        : "";
                  const tdStyle: CSSProperties = {
                    width: widths[key],
                    ...(isStickySocio
                      ? { left: stickyLeftBase }
                      : isStickyName
                        ? { left: stickyNameColLeft }
                        : {}),
                  };
                  return (
                  <td
                    key={key}
                    style={tdStyle}
                    className={`px-1.5 py-1 align-top ${stickyTd}`}
                  >
                    {cellValue(u, key)}
                  </td>
                  );
                })}
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

      {canManageUsersFully ? (
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
      ) : null}

      <UserQuickSheet
        user={scannedUser}
        busy={!!scannedUser && pendingId === scannedUser.id}
        canManageMemberActions={canManageUsersFully}
        backdropPointerEventsNone={
          pendingConfirm !== null || authDeniedOpen
        }
        onClose={() => {
          setScannedUserId(null);
          setQ("");
        }}
        onActivate={requestActivate}
        onDelivery={requestDelivery}
        onOpenPermissions={
          canEditPermissionsUI
            ? (u) => {
                setScannedUserId(null);
                setPermissionsUser(u);
              }
            : undefined
        }
      />

      {permissionsUser ? (
        <UserPermissionsModal
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={(u) => {
            startTransition(() => {
              setRows((prev) => prev.map((row) => (row.id === u.id ? u : row)));
            });
          }}
        />
      ) : null}

      {pendingConfirm?.kind === "activate" ? (
        <ActivateUserDialog
          user={pendingConfirm.user}
          mode={
            pendingConfirm.user.status === "pending_payment"
              ? "activate"
              : "renew"
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={({ paidAmountEuros }) => {
            const u = pendingConfirm.user;
            setPendingConfirm(null);
            window.setTimeout(() => {
              void runActivate(u, { paidAmountEuros });
            }, 0);
          }}
        />
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
      ) : pendingConfirm?.kind === "bulkDeliver" ? (
        <AdminConfirmDialog
          title="Entrega masiva"
          confirmLabel="Marcar entregado"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const users = pendingConfirm.users;
            setPendingConfirm(null);
            window.setTimeout(() => {
              void runBulkDeliver(users);
            }, 0);
          }}
        >
          Se marcará como entregado el bono de{" "}
          <strong className="text-foreground">
            {pendingConfirm.users.length}
          </strong>{" "}
          socio(s) seleccionado(s) que estén{" "}
          <strong className="text-foreground">activos</strong> y con{" "}
          <strong className="text-foreground">entrega pendiente</strong>.
        </AdminConfirmDialog>
      ) : pendingConfirm?.kind === "bulkActivate" ? (
        <AdminConfirmDialog
          title="Activación / renovación masiva"
          confirmLabel="Confirmar"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const users = pendingConfirm.users;
            setPendingConfirm(null);
            window.setTimeout(() => {
              void runBulkActivate(users);
            }, 0);
          }}
        >
          Se aplicará activación o renovación a{" "}
          <strong className="text-foreground">
            {pendingConfirm.users.length}
          </strong>{" "}
          socio(s) según corresponda (alta pendiente de pago, inactivo o renovación
          anual).
        </AdminConfirmDialog>
      ) : pendingConfirm?.kind === "deactivate" ? (
        <AdminConfirmDialog
          title="Dar de baja al socio"
          confirmLabel="Dar de baja"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const u = pendingConfirm.user;
            setPendingConfirm(null);
            window.setTimeout(() => {
              void runDeactivate(u);
            }, 0);
          }}
        >
          Se marcará a{" "}
          <strong className="text-foreground">{pendingConfirm.user.name}</strong>{" "}
          como <strong className="text-foreground">inactivo</strong>. No podrá
          iniciar sesión, pero el registro y su número de socio (
          <span className="font-mono">{pendingConfirm.user.membershipId ?? "—"}</span>
          ) se conservan. Puedes reactivarlo más adelante.
        </AdminConfirmDialog>
      ) : null}

      {inviteOpen && canInvite ? (
        <InviteMemberModal
          onClose={() => setInviteOpen(false)}
          onInvited={(info) => {
            setInviteOpen(false);
            setInviteFeedback(info);
          }}
        />
      ) : null}

      {editProfileUser && canEditProfile ? (
        <EditUserProfileModal
          user={editProfileUser}
          onClose={() => setEditProfileUser(null)}
          onSaved={(updated) => {
            startTransition(() => {
              setRows((prev) =>
                prev.map((row) =>
                  row.id === updated.id
                    ? {
                        ...row,
                        name: updated.name,
                        phone: updated.phone ?? undefined,
                        sex: updated.sex ?? undefined,
                        birthYear: updated.birthYear ?? undefined,
                        paidAmount:
                          updated.paidAmount === null
                            ? undefined
                            : updated.paidAmount,
                        paidAt:
                          updated.paidAt === null
                            ? undefined
                            : updated.paidAt,
                      }
                    : row,
                ),
              );
            });
            setEditProfileUser(null);
          }}
        />
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
