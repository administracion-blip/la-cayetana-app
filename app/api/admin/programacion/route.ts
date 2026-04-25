import { NextResponse } from "next/server";
import { requireProgramacionAdminForApi } from "@/lib/auth/admin";
import {
  createEvent,
  listAllEvents,
} from "@/lib/repositories/programacion";
import { eventSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireProgramacionAdminForApi();
  if (!auth.ok) return auth.response;
  const events = await listAllEvents();
  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const auth = await requireProgramacionAdminForApi();
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: firstIssue ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const event = await createEvent({
      title: parsed.data.title,
      description: parsed.data.description,
      startAt: new Date(parsed.data.startAt).toISOString(),
      imageKey: parsed.data.imageKey,
      imageContentType: parsed.data.imageContentType || undefined,
      published: parsed.data.published,
      showAsPopup: parsed.data.showAsPopup ?? false,
      createdByUserId: auth.user.id,
    });
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err) {
    console.error("[admin/programacion POST]", err);
    return NextResponse.json(
      { error: "No se pudo crear el evento" },
      { status: 500 },
    );
  }
}
