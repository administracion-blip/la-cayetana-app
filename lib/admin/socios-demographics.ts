import type { UserRecord } from "@/types/models";

const MIN_BIRTH_YEAR = 1920;

function validBirthYear(
  y: number | undefined,
  currentYear: number,
): y is number {
  return (
    typeof y === "number" &&
    Number.isFinite(y) &&
    y >= MIN_BIRTH_YEAR &&
    y <= currentYear
  );
}

export type SociosDemographicsStats =
  | { kind: "empty" }
  | {
      kind: "ok";
      total: number;
      sex: {
        female: { count: number; pct: number };
        male: { count: number; pct: number };
        preferNotToSay: { count: number; pct: number };
        unknown: { count: number; pct: number };
      };
      age: {
        /** Media en años, o `null` si no hay datos de año de nacimiento. */
        average: number | null;
        withBirthYear: number;
      };
    };

/**
 * Estadísticas de sexo (%) y edad media para socios confirmados
 * (`entityType === USER`). Los borradores se excluyen.
 */
export function getSociosDemographicsStats(
  users: UserRecord[],
): SociosDemographicsStats {
  const socios = users.filter((u) => u.entityType === "USER");
  const n = socios.length;
  if (n === 0) {
    return { kind: "empty" };
  }

  const year = new Date().getFullYear();
  let male = 0;
  let female = 0;
  let preferNot = 0;
  let sexUnknown = 0;
  const ages: number[] = [];

  for (const s of socios) {
    const sx = s.sex;
    if (sx === "male") male += 1;
    else if (sx === "female") female += 1;
    else if (sx === "prefer_not_to_say") preferNot += 1;
    else sexUnknown += 1;

    if (validBirthYear(s.birthYear, year)) {
      ages.push(year - s.birthYear!);
    }
  }

  const pct = (c: number) => (c / n) * 100;

  let average: number | null = null;
  if (ages.length > 0) {
    const sum = ages.reduce((a, b) => a + b, 0);
    average = Math.round((sum / ages.length) * 10) / 10;
  }

  return {
    kind: "ok",
    total: n,
    sex: {
      female: { count: female, pct: pct(female) },
      male: { count: male, pct: pct(male) },
      preferNotToSay: { count: preferNot, pct: pct(preferNot) },
      unknown: { count: sexUnknown, pct: pct(sexUnknown) },
    },
    age: {
      average,
      withBirthYear: ages.length,
    },
  };
}
