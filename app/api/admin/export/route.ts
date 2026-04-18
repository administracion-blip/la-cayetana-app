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
    const header =
      "membershipId,name,email,phone,sex,birthYear,createdAt,status,paidAmountCents,paidAmountEuros,paidAt,deliveryStatus,deliveredAt";
    const lines = users.map((u) => {
      const cents = typeof u.paidAmount === "number" ? u.paidAmount : "";
      const euros =
        typeof u.paidAmount === "number" ? (u.paidAmount / 100).toFixed(2) : "";
      const delivery =
        u.status === "active" ? u.deliveryStatus ?? "pending" : "";
      return [
        u.membershipId ?? "",
        u.name,
        u.email,
        u.phone ?? "",
        u.sex ?? "",
        u.birthYear ?? "",
        u.createdAt,
        u.status,
        cents,
        euros,
        u.paidAt ?? "",
        delivery,
        u.deliveredAt ?? "",
      ]
        .map((c) => escapeCsv(String(c)))
        .join(",");
    });
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
