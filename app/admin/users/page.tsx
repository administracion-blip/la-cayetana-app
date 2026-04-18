import Link from "next/link";
import { AdminExcelActions } from "@/components/admin/AdminExcelActions";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { listUsers } from "@/lib/repositories/users";
import type { UserRecord } from "@/types/models";

export const dynamic = "force-dynamic";

function stripPassword(u: UserRecord) {
  const { passwordHash, ...rest } = u;
  void passwordHash;
  return rest;
}

export default async function AdminUsersPage() {
  const users = await listUsers();
  const safe = users.map(stripPassword);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Administración · Socios</h1>
          <p className="mt-1 text-sm text-muted">
            Solo usuarios con <code className="text-xs">isAdmin: true</code> en
            DynamoDB pueden ver esta página.
          </p>
        </div>
        <AdminExcelActions />
      </div>

      <AdminUsersClient users={safe} />
    </div>
  );
}
