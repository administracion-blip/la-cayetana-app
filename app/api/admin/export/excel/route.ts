import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { requireSociosActionsForApi } from "@/lib/auth/admin";
import { listUsers } from "@/lib/repositories/users";
import { SOCIO_EXCEL_COLUMNS, userRecordToExcelRow } from "@/lib/socios-excel";

export async function GET() {
  try {
    const auth = await requireSociosActionsForApi();
    if (!auth.ok) return auth.response;

    const users = await listUsers();
    const header = [...SOCIO_EXCEL_COLUMNS];
    const dataRows = users.map((u) => {
      const r = userRecordToExcelRow(u);
      return header.map((k) => r[k as keyof typeof r]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    XLSX.utils.book_append_sheet(wb, ws, "Socios");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `socios-lacayetana-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo generar el Excel" },
      { status: 500 },
    );
  }
}
