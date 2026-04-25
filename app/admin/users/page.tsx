import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminExcelActions } from "@/components/admin/AdminExcelActions";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import {
  getAdminAreaUserOrRedirect,
  userCanAccessAdminSociosSection,
  userCanManageSociosActions,
} from "@/lib/auth/admin";
import { listUsersAndDrafts } from "@/lib/repositories/users";
import type { UserRecord } from "@/types/models";

export const dynamic = "force-dynamic";

function stripPassword(u: UserRecord) {
  const { passwordHash, pendingPasswordHash, ...rest } = u;
  void passwordHash;
  void pendingPasswordHash;
  return rest;
}

export default async function AdminUsersPage() {
  const currentUser = await getAdminAreaUserOrRedirect();
  if (!userCanAccessAdminSociosSection(currentUser)) {
    redirect("/admin");
  }
  // Incluimos los drafts pendientes de pago (flujo de activación manual).
  const users = await listUsersAndDrafts();
  const safe = users.map(stripPassword);
  const currentSafe = stripPassword(currentUser);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Administración · Socios</h1>
          <p className="mt-1 text-sm text-muted">
            Listado: <code className="text-xs">canAccessAdminSocios</code>,{" "}
            <code className="text-xs">canManageSociosActions</code> o{" "}
            <code className="text-xs">canEditUserPermissions</code>. Activar,
            entregas e import/export Excel:{" "}
            <code className="text-xs">canManageSociosActions</code>. Editar
            permisos: <code className="text-xs">canEditUserPermissions</code>.
          </p>
        </div>
        {userCanManageSociosActions(currentUser) ? <AdminExcelActions /> : null}
      </div>

      <AdminUsersClient users={safe} currentUser={currentSafe} />
    </div>
  );
}
