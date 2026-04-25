/**
 * Validación y snapshots de la selección de menús por reserva.
 */

import { mainCoursesForClientDisplay } from "@/lib/reservation-menus-helpers";
import type {
  ReservationMenuLineItem,
  ReservationMenuOffer,
} from "@/types/models";

export type MenuLineInput = {
  offerId: string;
  quantity: number;
  /** Un principal por ración, mismo orden que `quantity` unidades. */
  mainPicks?: string[];
};

export class ReservationMenuSelectionError extends Error {
  readonly code:
    | "sum_mismatch"
    | "invalid_offer"
    | "no_active_offers"
    | "empty_selection"
    | "main_picks_mismatch"
    | "invalid_main_pick";

  constructor(
    code: ReservationMenuSelectionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ReservationMenuSelectionError";
    this.code = code;
  }
}

function sumQuantities(lines: MenuLineInput[]): number {
  return lines.reduce((s, l) => s + Math.max(0, l.quantity), 0);
}

/**
 * Cada `pick` debe coincidir (trim o sin distinguir mayúsculas) con una
 * opción de `allowed`. Devuelve la forma canónica de `allowed`.
 */
function resolvePicksToSnapshot(
  picks: string[],
  allowed: string[],
): string[] {
  if (allowed.length === 0) {
    if (picks.length > 0) {
      throw new ReservationMenuSelectionError(
        "main_picks_mismatch",
        "Este menú no admite platos principales en carta: no envíes elecciones.",
      );
    }
    return [];
  }
  return picks.map((raw) => {
    const t = raw.trim();
    if (!t) {
      throw new ReservationMenuSelectionError(
        "main_picks_mismatch",
        "Falta elegir un principal en alguna de las raciones del menú.",
      );
    }
    const exact = allowed.find((a) => a.trim() === t);
    if (exact) return exact.trim();
    const ci = allowed.find(
      (a) => a.trim().toLowerCase() === t.toLowerCase(),
    );
    if (ci) return ci.trim();
    throw new ReservationMenuSelectionError(
      "invalid_main_pick",
      `Plato no disponible en la carta: “${t}”. Elige una de las opciones del menú.`,
    );
  });
}

/** Construye líneas snapshot para crear reserva (solo ofertas activas). */
export function buildMenuLineItemsForCreate(
  lines: MenuLineInput[],
  offers: ReservationMenuOffer[],
  partySize: number,
): ReservationMenuLineItem[] {
  const active = offers.filter((o) => o.active);
  const total = sumQuantities(lines);
  if (active.length === 0) {
    if (total > 0) {
      throw new ReservationMenuSelectionError(
        "no_active_offers",
        "No hay menús activos en la carta. Ajusta el catálogo o quita las cantidades.",
      );
    }
    return [];
  }
  const byId = new Map(active.map((o) => [o.offerId, o]));
  if (total !== partySize) {
    throw new ReservationMenuSelectionError(
      "sum_mismatch",
      `La suma de menús (${total}) debe coincidir con el número de comensales (${partySize}).`,
    );
  }
  const out: ReservationMenuLineItem[] = [];
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const o = byId.get(l.offerId);
    if (!o) {
      throw new ReservationMenuSelectionError(
        "invalid_offer",
        "Uno de los menús elegidos no está disponible.",
      );
    }
    const allowed = mainCoursesForClientDisplay(o.mainCourses);
    if (allowed.length > 0) {
      if (!l.mainPicks || l.mainPicks.length !== l.quantity) {
        throw new ReservationMenuSelectionError(
          "main_picks_mismatch",
          `Debes indicar un principal para cada ración de “${o.name}” (${l.quantity} elección${
            l.quantity === 1 ? "" : "es"
          }).`,
        );
      }
      out.push({
        offerId: l.offerId,
        quantity: l.quantity,
        nameSnapshot: o.name,
        priceCents: o.priceCents,
        mainCoursesSnapshot: resolvePicksToSnapshot(l.mainPicks, allowed),
      });
    } else {
      out.push({
        offerId: l.offerId,
        quantity: l.quantity,
        nameSnapshot: o.name,
        priceCents: o.priceCents,
        mainCoursesSnapshot: [],
      });
    }
  }
  if (out.length === 0) {
    throw new ReservationMenuSelectionError(
      "empty_selection",
      "Indica la cantidad de menús (sin ceros).",
    );
  }
  if (out.reduce((s, x) => s + x.quantity, 0) !== partySize) {
    throw new ReservationMenuSelectionError(
      "sum_mismatch",
      `La suma de menús (${total}) debe coincidir con el número de comensales (${partySize}).`,
    );
  }
  return out;
}

/**
 * Reconstruye líneas con snapshot desde el catálogo; si un menú se eliminó
 * del catálogo, reutiliza el snapshot previo de la reserva.
 */
export function buildMenuLineItemsForStaffUpdate(
  lines: MenuLineInput[],
  offers: ReservationMenuOffer[],
  partySize: number,
  previous: ReservationMenuLineItem[] | undefined,
): ReservationMenuLineItem[] {
  const byId = new Map(offers.map((o) => [o.offerId, o]));
  const prevById = new Map((previous ?? []).map((l) => [l.offerId, l]));
  const total = sumQuantities(lines);
  if (total !== partySize) {
    throw new ReservationMenuSelectionError(
      "sum_mismatch",
      `La suma de menús (${total}) debe coincidir con el número de comensales (${partySize}).`,
    );
  }
  const out: ReservationMenuLineItem[] = [];
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const o = byId.get(l.offerId);
    const prev = prevById.get(l.offerId);
    if (o) {
      const allowed = mainCoursesForClientDisplay(o.mainCourses);
      if (allowed.length > 0) {
        const hasPicksArray = Array.isArray(l.mainPicks);
        if (l.quantity > 0 && hasPicksArray && l.mainPicks!.length === 0) {
          throw new ReservationMenuSelectionError(
            "main_picks_mismatch",
            `Indica raciones de principal para “${o.name}” (${l.quantity} plato${
              l.quantity === 1 ? "" : "s"
            }). Un envío vacío reutilizaba el reparto antiguo por error; vuelve a repartir y guarda.`,
          );
        }
        if (hasPicksArray && l.mainPicks!.length > 0) {
          if (l.mainPicks!.length !== l.quantity) {
            throw new ReservationMenuSelectionError(
              "main_picks_mismatch",
              `Indica un principal por ración de “${o.name}” (${l.quantity} elecciones).`,
            );
          }
          out.push({
            offerId: l.offerId,
            quantity: l.quantity,
            nameSnapshot: o.name,
            priceCents: o.priceCents,
            mainCoursesSnapshot: resolvePicksToSnapshot(l.mainPicks!, allowed),
          });
        } else if (prev && prev.quantity === l.quantity) {
          out.push({
            offerId: l.offerId,
            quantity: l.quantity,
            nameSnapshot: o.name,
            priceCents: o.priceCents,
            mainCoursesSnapshot: [...prev.mainCoursesSnapshot],
          });
        } else {
          throw new ReservationMenuSelectionError(
            "main_picks_mismatch",
            `Debes indicar un principal para cada ración de “${o.name}” (${l.quantity} elección${
              l.quantity === 1 ? "" : "es"
            }).`,
          );
        }
      } else {
        out.push({
          offerId: l.offerId,
          quantity: l.quantity,
          nameSnapshot: o.name,
          priceCents: o.priceCents,
          mainCoursesSnapshot: [],
        });
      }
    } else if (prev) {
      out.push({
        offerId: l.offerId,
        quantity: l.quantity,
        nameSnapshot: prev.nameSnapshot,
        priceCents: prev.priceCents,
        mainCoursesSnapshot: [...prev.mainCoursesSnapshot],
      });
    } else {
      throw new ReservationMenuSelectionError(
        "invalid_offer",
        "Menú desconocido. Comprueba el identificador.",
      );
    }
  }
  if (out.length === 0) {
    throw new ReservationMenuSelectionError(
      "empty_selection",
      "Debe haber al menos una cantidad de menú mayor que cero.",
    );
  }
  return out;
}
