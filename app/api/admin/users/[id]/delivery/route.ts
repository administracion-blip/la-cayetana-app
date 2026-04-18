import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/auth/admin";
import {
  BonoDeliveryError,
  markUserBonoDelivered,
  markUserBonoPending,
} from "@/lib/repositories/users";

const bodySchema = z.object({
  action: z.enum(["deliver", "undo"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForApi();
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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Acción inválida" },
      { status: 400 },
    );
  }

  try {
    const user =
      parsed.data.action === "deliver"
        ? await markUserBonoDelivered({
            userId: id,
            adminUserId: auth.user.id,
          })
        : await markUserBonoPending({ userId: id });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        deliveryStatus: user.deliveryStatus ?? "pending",
        deliveredAt: user.deliveredAt ?? null,
        deliveredByUserId: user.deliveredByUserId ?? null,
      },
    });
  } catch (err) {
    if (err instanceof BonoDeliveryError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[admin/delivery]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la entrega" },
      { status: 500 },
    );
  }
}
