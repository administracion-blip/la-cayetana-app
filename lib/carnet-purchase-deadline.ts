import { getEnv } from "@/lib/env";

/**
 * Indica si ya ha pasado la fecha/hora límite configurada en
 * `FECHA_LIMITE_COMPRA_CARNET` (ISO 8601, típicamente UTC).
 * Si la variable no está definida o está vacía, las compras siguen permitidas.
 */
export function isCarnetPurchaseClosed(): boolean {
  const { FECHA_LIMITE_COMPRA_CARNET } = getEnv();
  if (!FECHA_LIMITE_COMPRA_CARNET) return false;
  const deadline = Date.parse(FECHA_LIMITE_COMPRA_CARNET);
  if (Number.isNaN(deadline)) return false;
  return Date.now() > deadline;
}
