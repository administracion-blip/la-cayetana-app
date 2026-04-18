import { NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/auth/admin";
import { listUsers } from "@/lib/repositories/users";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const users = await listUsers();
    const header = "membershipId,name,email,phone,createdAt,status";
    const lines = users.map((u) =>
      [
        u.membershipId,
        u.name,
        u.email,
        u.phone ?? "",
        u.createdAt,
        u.status,
      ]
        .map((c) => escapeCsv(String(c)))
        .join(","),
    );
    const csv = [header, ...lines].join("\r\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="socios-lacayetana.csv"',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo exportar" },
      { status: 500 },
    );
  }
}
