import { NextResponse } from "next/server";
import { clearGuestCookieOnResponse } from "@/lib/auth/guest-cookie";

export const dynamic = "force-dynamic";

/**
 * `POST /api/reservations/guest/logout`
 *
 * Cierra la sesión guest borrando la cookie `lc_guest_session`. El
 * cliente, además, sigue limpiando el `localStorage` legacy. Mientras
 * dure la migración dual ambos pasos son necesarios para que el
 * navegador no quede semi-autenticado.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearGuestCookieOnResponse(response);
  return response;
}
