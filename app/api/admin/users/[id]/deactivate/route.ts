import { NextResponse } from "next/server";
import { requireDeactivateSociosForApi } from "@/lib/auth/admin";
import {
  deactivateUserById,
  DeactivateUserError,
} from "@/lib/repositories/users";

/**
 * `POST /api/admin/users/:id/deactivate`
 *
 * Da de baja a un socio: cambia `status` a `inactive` sin borrar el
 * registro ni el `membershipId`. Idempotente (si ya está inactivo,
 * devuelve `ok` con el usuario tal cual).
 *
 * Permiso requerido: `canDeactivateSocios` (o `isAdmin` legacy).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDeactivateSociosForApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Id de usuario requerido" },
      { status: 400 },
    );
  }

  try {
    const updated = await deactivateUserById({
      userId: id,
      adminUserId: auth.user.id,
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        status: updated.status,
        deactivatedAt: updated.deactivatedAt ?? null,
        deactivatedByUserId: updated.deactivatedByUserId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof DeactivateUserError) {
      const status = e.message === "Usuario no encontrado" ? 404 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("[admin/users/deactivate] error", e);
    return NextResponse.json(
      { error: "No se pudo dar de baja al socio" },
      { status: 500 },
    );
  }
}
