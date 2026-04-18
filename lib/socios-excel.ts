import type { UserRecord, UserStatus } from "@/types/models";

/** Columnas del Excel exportado / esperado en importación (fila de cabecera). */
export const SOCIO_EXCEL_COLUMNS = [
  "membershipId",
  "id",
  "name",
  "email",
  "phone",
  "status",
  "createdAt",
  "exportedToAgora",
  "isAdmin",
] as const;

export type SocioExcelRow = Partial<
  Record<(typeof SOCIO_EXCEL_COLUMNS)[number], unknown>
>;

export function userRecordToExcelRow(u: UserRecord): Record<string, string | boolean> {
  return {
    membershipId: u.membershipId,
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    status: u.status,
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
