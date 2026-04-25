import type { ReservationMenuLineItem, ReservationRecord } from "@/types/models";

export type MenuForecastRow = {
  offerId: string;
  name: string;
  /** Raciones = suma de `quantity` de la línea. */
  quantity: number;
};

export type PrincipalForecastRow = {
  /** Clave de agrupación (minúsculas) para título estable. */
  key: string;
  /** Nombre mostrable (primera aparición). */
  displayName: string;
  count: number;
};

export type DateForecastRow = {
  reservationDate: string;
  reservas: number;
  comensales: number;
};

export type ReservationForecastPayload = {
  /** Día (fecha de reserva) del resumen. */
  reservationDate: string;
  reservationCount: number;
  totalComensales: number;
  reservasSinMenuDetallado: number;
  comensalesSinMenuDetallado: number;
  distinctMenuTypes: number;
  byMenu: MenuForecastRow[];
  byPrincipal: PrincipalForecastRow[];
  byDate: DateForecastRow[];
};

function normalizePrincipalKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Agrega datos de cocina / compra a partir de reservas (sin PII). Solo
 * lee `partySize`, `reservationDate` y `menuLineItems`.
 */
export function buildReservationForecast(
  reservationDate: string,
  reservations: ReservationRecord[],
  opts?: { includeByDateTable?: boolean },
): ReservationForecastPayload {
  const includeByDate = opts?.includeByDateTable ?? true;
  const byOffer = new Map<string, { name: string; quantity: number }>();
  const byPrincipal = new Map<string, { display: string; count: number }>();
  const byDate = new Map<string, { reservas: number; comensales: number }>();

  let reservasSinMenu = 0;
  let comensalesSinMenu = 0;

  for (const r of reservations) {
    if (includeByDate) {
      const d = r.reservationDate;
      if (byDate.has(d)) {
        const b = byDate.get(d)!;
        b.reservas += 1;
        b.comensales += r.partySize;
      } else {
        byDate.set(d, { reservas: 1, comensales: r.partySize });
      }
    }

    const lines: ReservationMenuLineItem[] = r.menuLineItems?.length
      ? r.menuLineItems
      : [];
    if (lines.length === 0) {
      reservasSinMenu += 1;
      comensalesSinMenu += r.partySize;
      continue;
    }

    for (const line of lines) {
      const name = (line.nameSnapshot ?? "").trim() || line.offerId;
      const prev = byOffer.get(line.offerId);
      if (prev) {
        byOffer.set(line.offerId, {
          name: prev.name,
          quantity: prev.quantity + line.quantity,
        });
      } else {
        byOffer.set(line.offerId, { name, quantity: line.quantity });
      }

      const mains = (line.mainCoursesSnapshot ?? [])
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0);
      for (const raw of mains) {
        const key = normalizePrincipalKey(raw);
        if (!key) continue;
        const disp = raw;
        const prevP = byPrincipal.get(key);
        if (prevP) {
          byPrincipal.set(key, { display: prevP.display, count: prevP.count + 1 });
        } else {
          byPrincipal.set(key, { display: disp, count: 1 });
        }
      }
    }
  }

  const byMenu: MenuForecastRow[] = Array.from(
    byOffer,
    ([offerId, v]) => ({
      offerId,
      name: v.name,
      quantity: v.quantity,
    }),
  ).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es"));

  const byPrincipalRows: PrincipalForecastRow[] = Array.from(
    byPrincipal,
    ([key, v]) => ({
      key,
      displayName: v.display,
      count: v.count,
    }),
  ).sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, "es"));

  const byDateRows: DateForecastRow[] = Array.from(
    byDate,
    ([reservationDate, v]) => ({
      reservationDate,
      reservas: v.reservas,
      comensales: v.comensales,
    }),
  ).sort((a, b) => a.reservationDate.localeCompare(b.reservationDate));

  return {
    reservationDate,
    reservationCount: reservations.length,
    totalComensales: reservations.reduce((acc, r) => acc + r.partySize, 0),
    reservasSinMenuDetallado: reservasSinMenu,
    comensalesSinMenuDetallado: comensalesSinMenu,
    distinctMenuTypes: byOffer.size,
    byMenu,
    byPrincipal: byPrincipalRows,
    byDate: byDateRows,
  };
}
