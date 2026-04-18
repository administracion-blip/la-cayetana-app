import type { UserRecord, UserStatus } from "@/types/models";

/** Columnas del Excel exportado / esperado en importación (fila de cabecera). */
export const SOCIO_EXCEL_COLUMNS = [
  "membershipId",
  "id",
  "name",
  "email",
  "phone",
  "sex",
  "birthYear",
  "status",
  "paidAmountCents",
  "paidAmountEuros",
  "paidAt",
  "deliveryStatus",
  "deliveredAt",
  "createdAt",
  "exportedToAgora",
  "isAdmin",
] as const;

export type SocioExcelRow = Partial<
  Record<(typeof SOCIO_EXCEL_COLUMNS)[number], unknown>
>;

function centsToEurosString(cents: number | undefined | null): string {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "";
  return (cents / 100).toFixed(2);
}

export function userRecordToExcelRow(
  u: UserRecord,
): Record<string, string | number | boolean> {
  return {
    membershipId: u.membershipId ?? "",
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    sex: u.sex ?? "",
    birthYear: u.birthYear ?? "",
    status: u.status,
    paidAmountCents: typeof u.paidAmount === "number" ? u.paidAmount : "",
    paidAmountEuros: centsToEurosString(u.paidAmount),
    paidAt: u.paidAt ?? "",
    deliveryStatus: u.status === "active" ? u.deliveryStatus ?? "pending" : "",
    deliveredAt: u.deliveredAt ?? "",
    createdAt: u.createdAt,
    exportedToAgora: u.exportedToAgora,
    isAdmin: u.isAdmin === true,
  };
}

const STATUSES: UserStatus[] = ["pending_payment", "active", "inactive"];

export function parseStatusCell(v: unknown): UserStatus | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  if (STATUSES.includes(s as UserStatus)) return s as UserStatus;
  return undefined;
}

export function parseBoolCell(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "sí" || s === "si") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}
