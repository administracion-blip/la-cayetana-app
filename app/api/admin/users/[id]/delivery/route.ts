import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireSociosActionsForApi,
  userCanManageSociosActions,
} from "@/lib/auth/admin";
import {
  BonoDeliveryError,
  getUserById,
  markUserBonoDelivered,
  markUserBonoPending,
} from "@/lib/repositories/users";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deliver") }),
  z.object({
    action: z.literal("undo"),
    authorizerUserId: z.string().min(1),
  }),
]);

const UNAUTHORIZED_UNDO =
  "No dispones de la autorización necesaria para esta acción.";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSociosActionsForApi();
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
    if (parsed.data.action === "undo") {
      const authorizer = await getUserById(parsed.data.authorizerUserId);
      if (
        !authorizer ||
        authorizer.entityType !== "USER" ||
        !userCanManageSociosActions(authorizer)
      ) {
        return NextResponse.json({ error: UNAUTHORIZED_UNDO }, { status: 403 });
      }
    }

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
