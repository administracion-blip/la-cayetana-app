import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";
import { toPublicUser } from "@/lib/public-user";

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    const user = await getUserById(session.sub);
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Error al cargar el usuario" },
      { status: 500 },
    );
  }
}
