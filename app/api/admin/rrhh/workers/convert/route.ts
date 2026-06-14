import { NextResponse } from "next/server";
import { requireRrhhManageForApi } from "@/lib/auth/admin";
import {
  createWorkerProfile,
  getWorkerProfile,
  recordRrhhAccess,
  updateWorkerProfileFields,
} from "@/lib/repositories/rrhh";
import { getUserById, updateUserFieldsById } from "@/lib/repositories/users";
import { convertWorkerSchema } from "@/lib/validation-rrhh";

export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/rrhh/workers/convert`
 *
 * Convierte a un socio existente en trabajador: crea su ficha laboral con los
 * datos sensibles aportados por el gestor y marca la cuenta con `isWorker`.
 * Permiso: gestión de RRHH. Registra auditoría y no vuelca datos sensibles.
 */
export async function POST(request: Request) {
  const guard = await requireRrhhManageForApi();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = convertWorkerSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Revisa los datos del formulario" },
      { status: 400 },
    );
  }

  const {
    userId,
    dni,
    socialSecurityNumber,
    iban,
    address,
    city,
    postalCode,
    position,
  } = parsed.data;

  try {
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "No se ha encontrado el socio" },
        { status: 404 },
      );
    }

    const existing = await getWorkerProfile(userId);
    if (existing) {
      // La ficha ya existe (p.ej. creada al marcar "Es trabajador"): se
      // rellenan/actualizan sus datos sensibles en lugar de rechazar.
      await updateWorkerProfileFields(userId, {
        dni,
        socialSecurityNumber,
        iban,
        address,
        city,
        postalCode,
        position: position || undefined,
      });
    } else {
      await createWorkerProfile({
        userId,
        nameSnapshot: user.name,
        emailSnapshot: user.email,
        dni,
        socialSecurityNumber,
        iban,
        address,
        city,
        postalCode,
        position: position || undefined,
      });
    }

    await updateUserFieldsById(userId, { isWorker: true });

    await recordRrhhAccess({
      userId,
      action: existing ? "edit_profile" : "create_profile",
      actorUserId: guard.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api][admin][rrhh][workers][convert]", err);
    return NextResponse.json(
      { error: "No se pudo convertir al socio en trabajador" },
      { status: 500 },
    );
  }
}
