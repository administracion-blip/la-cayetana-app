import { NextResponse } from "next/server";
import { requireRrhhViewForApi } from "@/lib/auth/admin";
import { getPositions, listWorkerProfiles } from "@/lib/repositories/rrhh";
import { getUsersByIdsBatch } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/rrhh/workers`
 *
 * Lista el personal dado de alta. Devuelve solo un resumen NO sensible
 * (sin DNI/NSS/IBAN/dirección); el detalle con datos sensibles se servirá
 * en un endpoint propio con permiso de gestión y auditoría.
 */
export async function GET() {
  const guard = await requireRrhhViewForApi();
  if (!guard.ok) return guard.response;

  try {
    const [profiles, positions] = await Promise.all([
      listWorkerProfiles(),
      getPositions(),
    ]);
    const colorByName = new Map(positions.map((p) => [p.name, p.color]));
    const users = await getUsersByIdsBatch(profiles.map((p) => p.userId));
    return NextResponse.json({
      workers: profiles.map((p) => {
        const user = users.get(p.userId);
        return {
          userId: p.userId,
          membershipId: user?.membershipId ?? null,
          name: p.nameSnapshot,
          email: p.emailSnapshot,
          phone: user?.phone ?? null,
          position: p.position ?? null,
          positionColor: p.position ? colorByName.get(p.position) ?? null : null,
          city: p.city,
          postalCode: p.postalCode,
          active: p.active !== false,
          createdAt: p.createdAt,
        };
      }),
    });
  } catch (err) {
    console.error("[api][admin][rrhh][workers][list]", err);
    return NextResponse.json(
      { error: "No se pudo listar el personal" },
      { status: 500 },
    );
  }
}
