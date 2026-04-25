/**
 * Texto corto del concepto bancario de la señal: letras A–Z (sin tildes ni
 * símbolos) y tramo fijo del id.
 */

const PADDING = "X";

function toAsciiUpperLetters(name: string): string {
  const upper = name.toUpperCase().replace(/Ñ/g, "N");
  const withoutMarks = upper
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return withoutMarks.replace(/[^A-Z]/g, "");
}

function namePrefixThreeLetters(name: string): string {
  const letters = toAsciiUpperLetters(name);
  return letters.slice(0, 3).padEnd(3, PADDING);
}

function firstReservationIdSegment(reservationId: string): string {
  const [first] = reservationId.split("-");
  if (first && first.length > 0) return first;
  const alnum = reservationId.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length > 0) return alnum.slice(0, 8);
  return "--------";
}

/**
 * `RES-` + 3 letras del contacto (sin acentos ni símbolos) + `-` + primer
 * tramo del id (p. ej. 8 hex del UUID).
 */
export function buildPrepaymentConcept(
  reservationId: string,
  contactName: string,
): string {
  return `RES-${namePrefixThreeLetters(contactName)}-${firstReservationIdSegment(
    reservationId,
  )}`;
}
