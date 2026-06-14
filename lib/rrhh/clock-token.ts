/**
 * Token rotatorio del terminal de fichaje. El terminal muestra un QR que
 * cambia cada pocos segundos; cada QR lleva un JWT de muy corta duración.
 * Un trabajador autenticado lo escanea y ficha: como el token caduca enseguida,
 * una captura de pantalla deja de ser válida (anti "pasar la foto del QR").
 *
 * La identidad la aporta SIEMPRE la sesión del trabajador, no el token: el
 * token solo demuestra presencia reciente frente a un terminal en vivo.
 */

import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

const PURPOSE = "rrhh-clock-terminal";

/** Validez del token del QR (segundos). Corto para invalidar capturas. */
export const TERMINAL_TOKEN_TTL_SEC = 40;

function getKey(): Uint8Array {
  const { SESSION_SECRET } = getEnv();
  return new TextEncoder().encode(SESSION_SECRET);
}

export async function signTerminalToken(): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TERMINAL_TOKEN_TTL_SEC}s`)
    .sign(getKey());
}

/** Verifica el token del QR. Devuelve `true` si es válido y no ha caducado. */
export async function verifyTerminalToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getKey());
    return payload.purpose === PURPOSE;
  } catch {
    return false;
  }
}
