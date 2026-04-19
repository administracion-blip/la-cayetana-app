import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { listPublishedPopupEvents } from "@/lib/repositories/programacion";
import { getUserById } from "@/lib/repositories/users";

export const dynamic = "force-dynamic";

/**
 * Devuelve, si existe, el evento pop up que debe mostrarse al socio logueado.
 * Estrategia: entre los eventos `published === true && showAsPopup === true`,
 * elegimos el más próximo en el tiempo (primero upcoming; si no hay upcoming,
 * el más reciente pasado). No se filtra por fecha en Dynamo (decisión de
 * producto: "sin filtro de fecha").
 */
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ event: null }, { status: 401 });
  }
  const user = await getUserById(session.sub);
  if (!user) {
    return NextResponse.json({ event: null }, { status: 401 });
  }

  try {
    const events = await listPublishedPopupEvents();
    if (events.length === 0) {
      return NextResponse.json({ event: null });
    }
    const now = Date.now();
    const upcoming = events.find((ev) => {
      const t = Date.parse(ev.startAt);
      return Number.isFinite(t) && t >= now;
    });
    const chosen =
      upcoming ??
      [...events]
        .reverse()
        .find((ev) => Number.isFinite(Date.parse(ev.startAt))) ??
      events[0];
    return NextResponse.json({
      event: {
        id: chosen.id,
        title: chosen.title,
        description: chosen.description,
        startAt: chosen.startAt,
        imageKey: chosen.imageKey,
      },
    });
  } catch (err) {
    console.error("[app/programacion/popup]", err);
    return NextResponse.json({ event: null }, { status: 500 });
  }
}
