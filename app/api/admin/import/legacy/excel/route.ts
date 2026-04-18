import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/auth/admin";
import {
  createLegacyUser,
  LegacyRangeError,
  MembershipIdTakenError,
} from "@/lib/repositories/users";
import { MAX_BIRTH_YEAR, MIN_BIRTH_YEAR, USER_SEX_VALUES } from "@/lib/validation";
import type { UserSex } from "@/types/models";

const MAX_ROWS = 2000;

type LegacyRow = {
  membershipId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  sex?: unknown;
  birthYear?: unknown;
  paidAmountCents?: unknown;
  paidAt?: unknown;
};

function parseString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function parseOptionalNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseSex(v: unknown): UserSex | undefined {
  const s = parseString(v).toLowerCase();
  if (!s) return undefined;
  const map: Record<string, UserSex> = {
    male: "male",
    hombre: "male",
    h: "male",
    m: "male",
    female: "female",
    mujer: "female",
    f: "female",
    prefer_not_to_say: "prefer_not_to_say",
    "prefiero no decirlo": "prefer_not_to_say",
    otros: "prefer_not_to_say",
  };
  const mapped = map[s];
  if (mapped && (USER_SEX_VALUES as readonly string[]).includes(mapped)) {
    return mapped;
  }
  return undefined;
}

function parsePaidAt(v: unknown): string | undefined {
  const s = parseString(v);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Envía el archivo como multipart/form-data (campo file)." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Falta el archivo (file)." },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "El Excel no tiene hojas." },
        { status: 400 },
      );
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<LegacyRow>(sheet, { defval: "" });

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_ROWS} filas por importación.` },
        { status: 400 },
      );
    }

    // Validación temprana de duplicados dentro del propio Excel.
    const seenMids = new Set<string>();
    const seenEmails = new Set<string>();
    const dupErrors: { row: number; message: string }[] = [];
    rows.forEach((r, i) => {
      const rowNum = i + 2;
      const mid = parseString(r.membershipId).toUpperCase();
      const email = parseString(r.email).toLowerCase();
      if (mid) {
        if (seenMids.has(mid)) {
          dupErrors.push({
            row: rowNum,
            message: `membershipId duplicado en el Excel: ${mid}`,
          });
        } else {
          seenMids.add(mid);
        }
      }
      if (email) {
        if (seenEmails.has(email)) {
          dupErrors.push({
            row: rowNum,
            message: `email duplicado en el Excel: ${email}`,
          });
        } else {
          seenEmails.add(email);
        }
      }
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [...dupErrors];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const membershipId = parseString(row.membershipId).toUpperCase();
      const name = parseString(row.name);
      const email = parseString(row.email).toLowerCase();
      const phone = parseString(row.phone);
      const sex = parseSex(row.sex);
      const birthYearRaw = parseOptionalNumber(row.birthYear);
      const paidAmountCents = parseOptionalNumber(row.paidAmountCents);
      const paidAt = parsePaidAt(row.paidAt);

      if (!membershipId && !name && !email) {
        skipped += 1;
        continue;
      }

      if (!membershipId) {
        errors.push({ row: rowNum, message: "Falta membershipId." });
        continue;
      }
      if (!name) {
        errors.push({ row: rowNum, message: "Falta name." });
        continue;
      }
      if (!email) {
        errors.push({ row: rowNum, message: "Falta email." });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({
          row: rowNum,
          message: `email inválido: ${email}`,
        });
        continue;
      }
      let birthYear: number | undefined = undefined;
      if (birthYearRaw !== undefined) {
        const by = Math.trunc(birthYearRaw);
        if (by < MIN_BIRTH_YEAR || by > MAX_BIRTH_YEAR) {
          errors.push({
            row: rowNum,
            message: `birthYear fuera de rango (${MIN_BIRTH_YEAR}-${MAX_BIRTH_YEAR}): ${by}`,
          });
          continue;
        }
        birthYear = by;
      }

      if (
        dupErrors.some((e) => e.row === rowNum && e.message.includes("duplicado"))
      ) {
        continue;
      }

      try {
        const res = await createLegacyUser({
          membershipId,
          name,
          email,
          phone: phone || undefined,
          sex,
          birthYear,
          paidAmountCents,
          paidAt,
        });
        if (res.updated) updated += 1;
        else created += 1;
      } catch (err) {
        if (err instanceof LegacyRangeError) {
          errors.push({ row: rowNum, message: err.message });
          continue;
        }
        if (err instanceof MembershipIdTakenError) {
          errors.push({ row: rowNum, message: err.message });
          continue;
        }
        errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : "Error al guardar",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      skipped,
      errors,
      message:
        errors.length === 0
          ? `Importación legacy: ${created} creados, ${updated} actualizados.`
          : `Procesado: ${created} creados, ${updated} actualizados; ${errors.length} error(es).`,
    });
  } catch (e) {
    console.error("[admin/import/legacy]", e);
    return NextResponse.json(
      { error: "No se pudo leer el Excel" },
      { status: 500 },
    );
  }
}
