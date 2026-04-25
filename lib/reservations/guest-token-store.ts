/**
 * Mini wrapper sobre `localStorage` para guardar el guest token JWT
 * emitido tras crear una reserva como invitado. El token permite al
 * navegador seguir viendo y gestionando la(s) reserva(s) del guest
 * durante 30 días sin volver a pedir email.
 *
 * Todo sucede en el cliente; el servidor lo recibe en la cabecera
 * `Authorization: Bearer <token>` al hacer fetch.
 */

const KEY = "lc_reservations_guest_token";
const EMAIL_KEY = "lc_reservations_guest_email";

/**
 * Recuerda el último email usado por el guest en el navegador para
 * pre-rellenarlo en el formulario de OTP / magic link. No es sensible
 * (el guest lo escribió él mismo) pero conviene respetar la opción de
 * limpiar si borra sesión.
 */
export function getStoredGuestEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setStoredGuestEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // Ignorar si localStorage está bloqueado.
  }
}

export function clearStoredGuestEmail(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EMAIL_KEY);
  } catch {
    // No crítico.
  }
}

export function getStoredGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setStoredGuestToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // Si localStorage está bloqueado (modo privado + Safari), no podemos
    // persistir: la sesión durará sólo lo que viva el árbol React.
  }
}

export function clearStoredGuestToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // No es crítico.
  }
}

/**
 * Construye los headers `Authorization` con el token almacenado (si hay).
 * Pensado para usarse al hacer `fetch` del front.
 */
export function authHeadersForGuest(): HeadersInit {
  const t = getStoredGuestToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}
