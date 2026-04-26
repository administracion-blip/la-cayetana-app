import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRouletteAdminForApi } from "@/lib/auth/admin";
import {
  getOrInitConfig,
  PRIZE_TYPES,
  updateConfig,
} from "@/lib/repositories/roulette";

export const dynamic = "force-dynamic";

/**
 * Configuración global de la Ruleta de la Suerte.
 *
 *  - `GET`  → devuelve el `RouletteConfigRecord` actual (creando defaults la
 *            primera vez si aún no existe el ítem `CONFIG#CURRENT`).
 *  - `PUT`  → actualiza parcialmente los campos del config. El cliente puede
 *            mandar solo los que cambian; los ausentes se conservan. Para
 *            limpiar las fechas de temporada hay que mandar `null` explícito.
 *
 * Acceso restringido a usuarios `isAdmin` (legacy) o con
 * `canEditRouletteConfig` (permiso granular dedicado, independiente de
 * `canEditUserPermissions` y de `canViewRouletteOps`, que solo da lectura
 * sobre el registro de operación). Ver `requireRouletteAdminForApi` para el
 * detalle.
 */

const SEASON_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const seasonDateField = z
  .union([
    z
      .string()
      .trim()
      .regex(SEASON_DATE_RE, "Fecha inválida, formato esperado yyyy-MM-dd"),
    z.null(),
  ])
  .optional();

const stockSchema = z.object(
  Object.fromEntries(
    PRIZE_TYPES.map((t) => [t, z.number().int().min(0).max(10_000).optional()]),
  ) as Record<(typeof PRIZE_TYPES)[number], z.ZodOptional<z.ZodNumber>>,
);

const configPatchSchema = z
  .object({
    timezone: z.string().trim().min(1).max(64).optional(),
    cycleStartHour: z.number().int().min(0).max(23).optional(),
    closedWindowStartHour: z.number().int().min(0).max(23).optional(),
    closedWindowEndHour: z.number().int().min(0).max(23).optional(),
    spinsPerCycle: z.number().int().min(1).max(20).optional(),
    redeemWindowSec: z.number().int().min(60).max(24 * 60 * 60).optional(),
    targetWinRate: z.number().min(0).max(1).optional(),
    dailyStock: stockSchema.optional(),
    shadowMembershipId: z
      .string()
      .trim()
      .regex(/^CY\d{3,}$/i, "Formato inválido (ej. CY1000)")
      .optional(),
    shadowWinRate: z.number().min(0).max(1).optional(),
    consolationEnabled: z.boolean().optional(),
    consolationWindowSec: z.number().int().min(60).max(24 * 60 * 60).optional(),
    consolationRewardLabel: z.string().trim().min(1).max(120).optional(),
    seasonStartDate: seasonDateField,
    seasonEndDate: seasonDateField,
  })
  .refine(
    (v) => {
      // Si vienen ambas fechas como string, exigimos start <= end. Si una es
      // null o ausente, la validación cruzada no aplica (queda abierto el
      // extremo correspondiente).
      if (
        typeof v.seasonStartDate === "string" &&
        typeof v.seasonEndDate === "string"
      ) {
        return v.seasonStartDate <= v.seasonEndDate;
      }
      return true;
    },
    {
      path: ["seasonEndDate"],
      message: "La fecha de fin no puede ser anterior a la de inicio",
    },
  );

export async function GET() {
  const guard = await requireRouletteAdminForApi();
  if (!guard.ok) return guard.response;
  const config = await getOrInitConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const guard = await requireRouletteAdminForApi();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = configPatchSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const config = await updateConfig({
      adminUserId: guard.user.id,
      patch: parsed.data,
    });
    return NextResponse.json({ config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[admin/roulette/config][PUT] ${msg}`);
    return NextResponse.json(
      { error: "No se pudo actualizar la configuración" },
      { status: 500 },
    );
  }
}
