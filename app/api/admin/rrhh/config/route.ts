import { NextResponse } from "next/server";
import {
  requireRrhhManageForApi,
  requireRrhhViewForApi,
} from "@/lib/auth/admin";
import { getRrhhConfig, updateRrhhConfig } from "@/lib/repositories/rrhh";
import { rrhhConfigSchema } from "@/lib/validation-rrhh";

export const dynamic = "force-dynamic";

/** `GET /api/admin/rrhh/config` — lee la config actual. Permiso: vista RRHH. */
export async function GET() {
  const guard = await requireRrhhViewForApi();
  if (!guard.ok) return guard.response;
  const config = await getRrhhConfig();
  return NextResponse.json({
    jornadaStartHour: config.jornadaStartHour,
    toleranceMin: config.toleranceMin,
  });
}

/**
 * `POST /api/admin/rrhh/config`
 *
 * Actualiza la hora de corte de jornada y/o la tolerancia. Permiso: gestión
 * RRHH. Acepta cualquiera de los dos campos (parcial).
 */
export async function POST(req: Request) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = rrhhConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Configuración inválida" },
      { status: 400 },
    );
  }

  try {
    const config = await updateRrhhConfig({
      jornadaStartHour: parsed.data.jornadaStartHour,
      toleranceMin: parsed.data.toleranceMin,
      actorUserId: guard.user.id,
    });
    return NextResponse.json({
      ok: true,
      jornadaStartHour: config.jornadaStartHour,
      toleranceMin: config.toleranceMin,
    });
  } catch (err) {
    console.error("[api][admin][rrhh][config]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la configuración" },
      { status: 500 },
    );
  }
}
