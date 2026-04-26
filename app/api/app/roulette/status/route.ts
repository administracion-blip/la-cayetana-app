import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  getStatusForUser,
  PRIZE_LABEL,
  type RouletteStatus,
} from "@/lib/repositories/roulette";

export const dynamic = "force-dynamic";

/** Serializa el estado para el cliente (incluye etiqueta humana del premio). */
function serializeStatus(status: RouletteStatus) {
  const activePrize = status.activePrize
    ? {
        prizeId: status.activePrize.prizeId,
        prizeType: status.activePrize.prizeType,
        prizeLabel: PRIZE_LABEL[status.activePrize.prizeType],
        awardedAt: status.activePrize.awardedAt,
        expiresAt: status.activePrize.expiresAt,
        shadow: status.activePrize.shadow,
      }
    : null;
  const activeConsolation = status.activeConsolation
    ? {
        consolationId: status.activeConsolation.consolationId,
        rewardType: status.activeConsolation.rewardType,
        rewardLabel: status.activeConsolation.rewardLabel,
        awardedAt: status.activeConsolation.awardedAt,
        expiresAt: status.activeConsolation.expiresAt,
      }
    : null;
  return {
    cycleId: status.cycleId,
    spinsRemaining: status.spinsRemaining,
    spinsPerCycle: status.spinsPerCycle,
    disabled: status.disabled,
    shadow: status.shadow,
    closed: status.closed,
    opensAt: status.opensAt,
    seasonClosed: status.seasonClosed,
    seasonReason: status.seasonReason,
    seasonOpensAt: status.seasonOpensAt,
    activePrize,
    activeConsolation,
  };
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const status = await getStatusForUser(session.sub);
    return NextResponse.json(serializeStatus(status));
  } catch (err) {
    console.error("[roulette/status]", err);
    return NextResponse.json(
      { error: "No se pudo obtener el estado de la ruleta" },
      { status: 500 },
    );
  }
}
