import { NextResponse } from "next/server";
import { requireEditSociosProfileForApi } from "@/lib/auth/admin";
import {
  getUserById,
  updateUserFieldsById,
} from "@/lib/repositories/users";
import { adminUserProfilePatchSchema } from "@/lib/validation";

/**
 * `PATCH /api/admin/users/:id`
 *
 * Edita la ficha de un socio: nombre, teléfono, sexo y año de nacimiento.
 * Requiere el permiso `canEditSociosProfile` (o `isAdmin` legacy).
 *
 * Limitaciones intencionadas:
 *  - El email no se cambia desde aquí (afecta a inicio de sesión y a la
 *    unicidad por `emailLockId`; queda fuera de este flujo).
 *  - La contraseña se cambia por el flujo "olvidé mi contraseña" o desde
 *    el perfil del socio.
 *  - Los permisos se gestionan desde `permissions` (otra ruta).
 *  - El estado se modifica vía activación o baja lógica.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireEditSociosProfileForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Id de usuario requerido" },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = adminUserProfilePatchSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 },
    );
  }

  const { name, phone, sex, birthYear } = parsed.data;
  await updateUserFieldsById(id, {
    ...(name !== undefined ? { name } : {}),
    ...(phone !== undefined
      ? { phone: phone === "" || phone === null ? null : phone }
      : {}),
    ...(sex !== undefined ? { sex: sex ?? null } : {}),
    ...(birthYear !== undefined
      ? { birthYear: birthYear ?? null }
      : {}),
  });

  const updated = await getUserById(id);
  if (!updated) {
    return NextResponse.json(
      { error: "El usuario ya no existe" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      name: updated.name,
      phone: updated.phone ?? null,
      sex: updated.sex ?? null,
      birthYear: updated.birthYear ?? null,
    },
  });
}
