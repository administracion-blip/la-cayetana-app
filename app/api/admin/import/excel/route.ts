import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/auth/admin";
import {
  listUsers,
  updateUserFieldsById,
  type AdminUserPatch,
} from "@/lib/repositories/users";
import {
  parseBoolCell,
  parseStatusCell,
  type SocioExcelRow,
} from "@/lib/socios-excel";

const MAX_ROWS = 2000;

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
      return NextResponse.json({ error: "Falta el archivo (file)." }, { status: 400 });
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
    const rows = XLSX.utils.sheet_to_json<SocioExcelRow>(sheet, {
      defval: "",
    });

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_ROWS} filas por importación.` },
        { status: 400 },
      );
    }

    const allUsers = await listUsers();
    const byMembershipId = new Map(
      allUsers
        .filter((u) => !!u.membershipId)
        .map((u) => [u.membershipId!.trim().toUpperCase(), u]),
    );

    let updated = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const midRaw = row.membershipId;
      const membershipId =
        typeof midRaw === "string" || typeof midRaw === "number"
          ? String(midRaw).trim().toUpperCase()
          : "";

      if (!membershipId) {
        skipped += 1;
        continue;
      }

      const user = byMembershipId.get(membershipId);
      if (!user) {
        errors.push({
          row: rowNum,
          message: `No existe socio con membershipId «${membershipId}».`,
        });
        continue;
      }

      const patch: AdminUserPatch = {};

      if (row.name !== undefined && row.name !== "") {
        patch.name = String(row.name).trim();
      }
      if (row.phone !== undefined) {
        const p = String(row.phone).trim();
        patch.phone = p === "" ? "" : p;
      }
      const st = parseStatusCell(row.status);
      if (st !== undefined) patch.status = st;

      const exp = parseBoolCell(row.exportedToAgora);
      if (exp !== undefined) patch.exportedToAgora = exp;

      const adm = parseBoolCell(row.isAdmin);
      if (adm !== undefined) patch.isAdmin = adm;

      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }

      try {
        await updateUserFieldsById(user.id, patch);
        updated += 1;
      } catch (e) {
        errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : "Error al guardar",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      errors,
      message:
        errors.length === 0
          ? `Importación completada: ${updated} fila(s) actualizada(s).`
          : `Actualizadas ${updated} fila(s); ${errors.length} error(es).`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo leer el Excel" },
      { status: 500 },
    );
  }
}
