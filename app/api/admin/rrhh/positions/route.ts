import { NextResponse } from "next/server";
import {
  requireRrhhManageForApi,
  requireRrhhViewForApi,
} from "@/lib/auth/admin";
import { addPosition, getPositions } from "@/lib/repositories/rrhh";
import { createPositionSchema } from "@/lib/validation-rrhh";

export const dynamic = "force-dynamic";

/** `GET /api/admin/rrhh/positions` — catálogo de puestos. Permiso: vista. */
export async function GET() {
  const guard = await requireRrhhViewForApi();
  if (!guard.ok) return guard.response;
  try {
    const positions = await getPositions();
    return NextResponse.json({ positions });
  } catch (err) {
    console.error("[api][admin][rrhh][positions][list]", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los puestos" },
      { status: 500 },
    );
  }
}

/** `POST /api/admin/rrhh/positions` — añade un puesto. Permiso: gestión. */
export async function POST(request: Request) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = createPositionSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos del puesto inválidos" },
      { status: 400 },
    );
  }

  try {
    const positions = await addPosition({
      name: parsed.data.name,
      color: parsed.data.color,
      actorUserId: guard.user.id,
    });
    return NextResponse.json({ ok: true, positions });
  } catch (err) {
    console.error("[api][admin][rrhh][positions][create]", err);
    return NextResponse.json(
      { error: "No se pudo crear el puesto" },
      { status: 500 },
    );
  }
}
