import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRouletteOpsForApi } from "@/lib/auth/admin";
import {
  getActiveCycleId,
  getConsolationsByIds,
  getCycleMetaPublic,
  getOrInitConfig,
  getPrizesByIds,
  listSpinsForCycle,
  listUserCyclesForCycle,
  PRIZE_LABEL,
  type RouletteConsolationRecord,
  type RoulettePrizeRecord,
  type RouletteSpinRecord,
} from "@/lib/repositories/roulette";
import { getUsersByIdsBatch } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/roulette/cycles?date=yyyy-MM-dd`
 *
 * Endpoint estrictamente de **lectura** que devuelve el registro de la
 * jornada (`cycleId`) indicada: KPIs, stock, tiradas, premios y rascas. Si
 * no se pasa `date`, se calcula la jornada activa con `getActiveCycleId`
 * (respeta `cycleStartHour`/`timezone` del config).
 *
 * Las tiradas del usuario shadow viven bajo `PK = SHADOW#…`, así que la
 * query ya las omite por construcción. No exponemos un toggle para
 * incluirlas: el panel de operación es solo para socios reales.
 *
 * Acceso:
 *  - `canViewRouletteOps` (rol "monitor de ruleta", solo lectura), o
 *  - `canEditRouletteConfig` (super-admin de ruleta), o
 *  - `isAdmin` legacy.
 *
 * Cualquier mutación se hace por sus flujos dedicados (ruleta del socio,
 * validador de premios, jobs de expiración o `/admin/roulette/config`),
 * NUNCA desde aquí.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  date: z.string().regex(DATE_RE).optional(),
});

type SpinRow = {
  spinId: string;
  createdAt: string;
  userId: string;
  membershipId: string | null;
  name: string | null;
  email: string | null;
  outcome: RouletteSpinRecord["outcome"];
  prizeType: RouletteSpinRecord["prizeType"];
  prizeLabel: string | null;
  loseReason: RouletteSpinRecord["loseReason"];
  prize: PrizeRow | null;
};

type PrizeRow = {
  prizeId: string;
  status: RoulettePrizeRecord["status"];
  awardedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserName: string | null;
  discardedAt: string | null;
};

type ConsolationRow = {
  consolationId: string;
  awardedAt: string;
  userId: string;
  membershipId: string | null;
  name: string | null;
  email: string | null;
  rewardLabel: string;
  status: RouletteConsolationRecord["status"];
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserName: string | null;
};

type Kpis = {
  spinsTotal: number;
  winsTotal: number;
  losesTotal: number;
  prizesAwarded: number;
  prizesPending: number;
  prizesRedeemed: number;
  prizesExpired: number;
  prizesDiscarded: number;
  consolationsAwarded: number;
  consolationsRedeemed: number;
  consolationsExpired: number;
};

export async function GET(request: Request) {
  const guard = await requireRouletteOpsForApi();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Fecha inválida (yyyy-MM-dd)" },
      { status: 400 },
    );
  }

  try {
    const config = await getOrInitConfig();
    const now = new Date();
    const activeCycle = getActiveCycleId(now, config);
    const cycleId = parsed.data.date ?? activeCycle.cycleId;
    const isActiveCycle = cycleId === activeCycle.cycleId;

    const [meta, spins, userCycles] = await Promise.all([
      getCycleMetaPublic(cycleId),
      listSpinsForCycle(cycleId),
      listUserCyclesForCycle(cycleId),
    ]);

    const prizeIds: string[] = [];
    for (const s of spins) {
      if (s.prizeId) prizeIds.push(s.prizeId);
    }
    const consolationIds: string[] = [];
    for (const uc of userCycles) {
      if (uc.consolationId) consolationIds.push(uc.consolationId);
    }
    const [prizesById, consolationsById] = await Promise.all([
      getPrizesByIds(prizeIds),
      getConsolationsByIds(consolationIds),
    ]);

    const userIds = new Set<string>();
    for (const s of spins) userIds.add(s.userId);
    for (const uc of userCycles) userIds.add(uc.userId);
    for (const p of prizesById.values()) {
      if (p.redeemedByUserId) userIds.add(p.redeemedByUserId);
      if (p.discardedByUserId) userIds.add(p.discardedByUserId);
    }
    for (const c of consolationsById.values()) {
      if (c.redeemedByUserId) userIds.add(c.redeemedByUserId);
    }
    const usersById = await getUsersByIdsBatch(Array.from(userIds));

    const cycleStartIso =
      meta?.startsAt ?? activeCycle.startsAt ?? null;
    const cycleEndIso = meta?.endsAt ?? activeCycle.endsAt ?? null;

    spins.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const spinRows: SpinRow[] = spins.map((s) => {
      const u = usersById.get(s.userId);
      const prize = s.prizeId ? prizesById.get(s.prizeId) ?? null : null;
      const redeemerName = prize?.redeemedByUserId
        ? usersById.get(prize.redeemedByUserId)?.name ?? null
        : null;
      return {
        spinId: s.spinId,
        createdAt: s.createdAt,
        userId: s.userId,
        membershipId: s.membershipId ?? u?.membershipId ?? null,
        name: u?.name ?? null,
        email: u?.email ?? null,
        outcome: s.outcome,
        prizeType: s.prizeType,
        prizeLabel: s.prizeType ? PRIZE_LABEL[s.prizeType] : null,
        loseReason: s.loseReason,
        prize: prize
          ? {
              prizeId: prize.prizeId,
              status: prize.status,
              awardedAt: prize.awardedAt,
              expiresAt: prize.expiresAt,
              redeemedAt: prize.redeemedAt ?? null,
              redeemedByUserId: prize.redeemedByUserId ?? null,
              redeemedByUserName: redeemerName,
              discardedAt: prize.discardedAt ?? null,
            }
          : null,
      };
    });

    const consolationRows: ConsolationRow[] = [];
    const sortedUserCycles = [...userCycles].sort((a, b) =>
      (a.lastSpinAt ?? "").localeCompare(b.lastSpinAt ?? ""),
    );
    for (const uc of sortedUserCycles) {
      if (!uc.consolationId) continue;
      const c = consolationsById.get(uc.consolationId);
      if (!c) continue;
      const u = usersById.get(c.userId);
      const redeemerName = c.redeemedByUserId
        ? usersById.get(c.redeemedByUserId)?.name ?? null
        : null;
      consolationRows.push({
        consolationId: c.consolationId,
        awardedAt: c.awardedAt,
        userId: c.userId,
        membershipId: c.membershipId ?? u?.membershipId ?? null,
        name: u?.name ?? null,
        email: u?.email ?? null,
        rewardLabel: c.rewardLabel,
        status: c.status,
        expiresAt: c.expiresAt,
        redeemedAt: c.redeemedAt ?? null,
        redeemedByUserId: c.redeemedByUserId ?? null,
        redeemedByUserName: redeemerName,
      });
    }

    const kpis = computeKpis(spinRows, consolationRows);

    const stockInitial = meta?.stockInitial ?? config.dailyStock;
    const stockRemaining = meta?.stockRemaining ?? config.dailyStock;

    return NextResponse.json({
      cycleId,
      isActiveCycle,
      activeCycleId: activeCycle.cycleId,
      startsAt: cycleStartIso,
      endsAt: cycleEndIso,
      timezone: config.timezone,
      cycleStartHour: config.cycleStartHour,
      stockInitial,
      stockRemaining,
      kpis,
      spins: spinRows,
      consolations: consolationRows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[admin/roulette/cycles][GET] ${msg}`);
    return NextResponse.json(
      { error: "No se pudo cargar el registro" },
      { status: 500 },
    );
  }
}

function computeKpis(
  spins: SpinRow[],
  consolations: ConsolationRow[],
): Kpis {
  const k: Kpis = {
    spinsTotal: spins.length,
    winsTotal: 0,
    losesTotal: 0,
    prizesAwarded: 0,
    prizesPending: 0,
    prizesRedeemed: 0,
    prizesExpired: 0,
    prizesDiscarded: 0,
    consolationsAwarded: 0,
    consolationsRedeemed: 0,
    consolationsExpired: 0,
  };
  const now = Date.now();
  for (const s of spins) {
    if (s.outcome === "win") {
      k.winsTotal += 1;
      k.prizesAwarded += 1;
    } else {
      k.losesTotal += 1;
    }
    if (s.prize) {
      switch (s.prize.status) {
        case "redeemed":
          k.prizesRedeemed += 1;
          break;
        case "expired":
          k.prizesExpired += 1;
          break;
        case "discarded":
          k.prizesDiscarded += 1;
          break;
        case "awarded": {
          const exp = Date.parse(s.prize.expiresAt);
          if (Number.isFinite(exp) && exp <= now) {
            k.prizesExpired += 1;
          } else {
            k.prizesPending += 1;
          }
          break;
        }
      }
    }
  }
  for (const c of consolations) {
    k.consolationsAwarded += 1;
    if (c.status === "redeemed") k.consolationsRedeemed += 1;
    else if (c.status === "expired") k.consolationsExpired += 1;
    else if (c.status === "awarded") {
      const exp = Date.parse(c.expiresAt);
      if (Number.isFinite(exp) && exp <= now) {
        k.consolationsExpired += 1;
      }
    }
  }
  return k;
}
