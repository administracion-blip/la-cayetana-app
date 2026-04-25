/**
 * Cierres temporales para funcionalidades públicas:
 *  - Compra/alta de carnet (web).
 *  - Creación de nuevas reservas de mesa.
 *  - Login de usuarios (con bypass para staff/admin).
 *
 * Fuente de verdad: ítem `PK = CONFIG`, `SK = CARNET` en la tabla de
 * reservas. Para compatibilidad con despliegues previos, si la variable
 * de entorno `FECHA_LIMITE_COMPRA_CARNET` está definida, manda sobre el
 * panel (solo para carnet). Los otros dos gates sólo se gobiernan desde
 * admin.
 */

import { getEnv } from "@/lib/env";
import { getAccessGatesConfig } from "@/lib/repositories/reservation-config";

export interface AccessGatesStatus {
  carnetPurchaseClosed: boolean;
  tableReservationClosed: boolean;
  loginClosed: boolean;
}

const CACHE_TTL_MS = 30_000;
type CacheEntry = { status: AccessGatesStatus; loadedAt: number };
let cache: CacheEntry | null = null;

export function invalidateAccessGatesCache(): void {
  cache = null;
}

/** Compat: nombre antiguo, equivale a `invalidateAccessGatesCache`. */
export const invalidateCarnetPurchaseDeadlineCache = invalidateAccessGatesCache;

function isPastIso(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
}

function deadlineMsFromEnv(): number | null {
  const { FECHA_LIMITE_COMPRA_CARNET } = getEnv();
  if (!FECHA_LIMITE_COMPRA_CARNET) return null;
  const t = Date.parse(FECHA_LIMITE_COMPRA_CARNET);
  if (Number.isNaN(t)) return null;
  return t;
}

export async function getAccessGates(): Promise<AccessGatesStatus> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.status;
  }

  let carnetFromDynamoIso: string | undefined;
  let tableFromDynamoIso: string | undefined;
  let loginFromDynamoIso: string | undefined;
  try {
    const cfg = await getAccessGatesConfig();
    carnetFromDynamoIso = cfg.carnetPurchaseDeadlineIso?.trim() || undefined;
    tableFromDynamoIso = cfg.tableReservationDeadlineIso?.trim() || undefined;
    loginFromDynamoIso = cfg.loginDeadlineIso?.trim() || undefined;
  } catch (err) {
    console.warn("[access-gates] getAccessGatesConfig", err);
  }

  const envCarnetMs = deadlineMsFromEnv();
  const carnetPurchaseClosed =
    envCarnetMs != null ? Date.now() > envCarnetMs : isPastIso(carnetFromDynamoIso);
  const tableReservationClosed = isPastIso(tableFromDynamoIso);
  const loginClosed = isPastIso(loginFromDynamoIso);

  const status: AccessGatesStatus = {
    carnetPurchaseClosed,
    tableReservationClosed,
    loginClosed,
  };
  cache = { status, loadedAt: now };
  return status;
}

export async function isCarnetPurchaseClosed(): Promise<boolean> {
  return (await getAccessGates()).carnetPurchaseClosed;
}

export async function isTableReservationClosed(): Promise<boolean> {
  return (await getAccessGates()).tableReservationClosed;
}

export async function isLoginClosed(): Promise<boolean> {
  return (await getAccessGates()).loginClosed;
}
