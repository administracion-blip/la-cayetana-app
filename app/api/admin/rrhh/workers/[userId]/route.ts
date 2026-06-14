import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import {
  getWorkerProfile,
  recordRrhhAccess,
  setWorkerProfileActive,
  updateWorkerProfileFields,
} from "@/lib/repositories/rrhh";
import { editWorkerProfileSchema } from "@/lib/validation-rrhh";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ active: z.boolean() });

type Params = { params: Promise<{ userId: string }> };

/**
 * `GET /api/admin/rrhh/workers/[userId]`
 *
 * Devuelve la ficha laboral con datos sensibles. Permiso: gestión RRHH.
 * Registra auditoría de consulta.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { userId } = await params;

  try {
    const profile = await getWorkerProfile(userId);
    if (!profile) {
      return NextResponse.json({ profile: null });
    }
    await recordRrhhAccess({
      userId,
      action: "view_profile",
      actorUserId: guard.user.id,
    });
    return NextResponse.json({
      profile: {
        dni: profile.dni,
        socialSecurityNumber: profile.socialSecurityNumber,
        iban: profile.iban,
        address: profile.address,
        city: profile.city,
        postalCode: profile.postalCode,
        position: profile.position ?? "",
      },
    });
  } catch (err) {
    console.error("[api][admin][rrhh][workers][get]", err);
    return NextResponse.json(
      { error: "No se pudo cargar la ficha" },
      { status: 500 },
    );
  }
}

/**
 * `PATCH /api/admin/rrhh/workers/[userId]`
 *
 * Activa o da de baja al trabajador en RRHH (no borra la ficha). Un
 * trabajador inactivo no aparece para planificar turnos. Permiso: gestión.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { userId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    const profile = await getWorkerProfile(userId);
    if (!profile) {
      return NextResponse.json(
        { error: "Trabajador no encontrado" },
        { status: 404 },
      );
    }
    await setWorkerProfileActive(userId, parsed.data.active);
    return NextResponse.json({ ok: true, active: parsed.data.active });
  } catch (err) {
    console.error("[api][admin][rrhh][workers][active]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el estado" },
      { status: 500 },
    );
  }
}

/**
 * `PUT /api/admin/rrhh/workers/[userId]`
 *
 * Edita los datos laborales (sensibles) del trabajador. Permiso: gestión.
 * Registra auditoría de la edición.
 */
export async function PUT(request: Request, { params }: Params) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  const { userId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = editWorkerProfileSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Revisa los datos del formulario" },
      { status: 400 },
    );
  }

  try {
    const profile = await getWorkerProfile(userId);
    if (!profile) {
      return NextResponse.json(
        { error: "Trabajador no encontrado" },
        { status: 404 },
      );
    }
    await updateWorkerProfileFields(userId, parsed.data);
    await recordRrhhAccess({
      userId,
      action: "edit_profile",
      actorUserId: guard.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api][admin][rrhh][workers][edit]", err);
    return NextResponse.json(
      { error: "No se pudo guardar la ficha" },
      { status: 500 },
    );
  }
}
