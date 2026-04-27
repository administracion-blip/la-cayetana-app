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

  const { name, phone, sex, birthYear, paidAmountEuros, paidAt } = parsed.data;

  /**
   * Normaliza `YYYY-MM-DD` a un ISO completo (mediodía UTC) para que en
   * cualquier zona horaria se vea como ese día. Si ya viene un ISO completo
   * lo dejamos tal cual.
   */
  function normalizePaidAt(input: string | null | undefined): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null || input === "") return null;
    const datePart = /^\d{4}-\d{2}-\d{2}$/;
    if (datePart.test(input)) {
      return new Date(`${input}T12:00:00.000Z`).toISOString();
    }
    return input;
  }

  await updateUserFieldsById(id, {
    ...(name !== undefined ? { name } : {}),
    ...(phone !== undefined
      ? { phone: phone === "" || phone === null ? null : phone }
      : {}),
    ...(sex !== undefined ? { sex: sex ?? null } : {}),
    ...(birthYear !== undefined
      ? { birthYear: birthYear ?? null }
      : {}),
    ...(paidAmountEuros !== undefined
      ? { paidAmount: paidAmountEuros }
      : {}),
    ...(paidAt !== undefined
      ? { paidAt: normalizePaidAt(paidAt) ?? null }
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
      paidAmount: updated.paidAmount ?? null,
      paidAt: updated.paidAt ?? null,
    },
  });
}
