import { NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getEnv } from "@/lib/env";
import {
  deleteEvent,
  EventNotFoundError,
  getEventById,
  updateEvent,
} from "@/lib/repositories/programacion";
import { deleteObject } from "@/lib/s3";
import { eventPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ event });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = eventPatchSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  // Si cambia la imagen, borramos la anterior de S3 tras actualizar en Dynamo.
  const before = await getEventById(id);
  if (!before) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  try {
    const event = await updateEvent(id, {
      title: parsed.data.title,
      description: parsed.data.description,
      startAt: parsed.data.startAt
        ? new Date(parsed.data.startAt).toISOString()
        : undefined,
      imageKey: parsed.data.imageKey,
      imageContentType: parsed.data.imageContentType || undefined,
      published: parsed.data.published,
      showAsPopup: parsed.data.showAsPopup,
      updatedByUserId: auth.user.id,
    });

    if (
      parsed.data.imageKey &&
      parsed.data.imageKey !== before.imageKey &&
      before.imageKey
    ) {
      const { PROGRAMACION_S3_BUCKET } = getEnv();
      try {
        await deleteObject({
          bucket: PROGRAMACION_S3_BUCKET,
          key: before.imageKey,
        });
      } catch (err) {
        console.warn("[admin/programacion] no se pudo borrar S3 anterior", err);
      }
    }

    return NextResponse.json({ ok: true, event });
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("[admin/programacion PATCH]", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el evento" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = await getEventById(id);
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  try {
    await deleteEvent(id);
  } catch (err) {
    console.error("[admin/programacion DELETE]", err);
    return NextResponse.json(
      { error: "No se pudo eliminar el evento" },
      { status: 500 },
    );
  }
  if (existing.imageKey) {
    const { PROGRAMACION_S3_BUCKET } = getEnv();
    try {
      await deleteObject({
        bucket: PROGRAMACION_S3_BUCKET,
        key: existing.imageKey,
      });
    } catch (err) {
      console.warn("[admin/programacion] no se pudo borrar imagen S3", err);
    }
  }
  return NextResponse.json({ ok: true });
}
