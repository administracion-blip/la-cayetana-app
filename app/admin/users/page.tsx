import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminExcelActions } from "@/components/admin/AdminExcelActions";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import {
  getAdminAreaUserOrRedirect,
  userCanAccessAdminSociosSection,
  userCanManageSociosActions,
} from "@/lib/auth/admin";
import { getSociosDemographicsStats } from "@/lib/admin/socios-demographics";
import { SociosDemographicsCard } from "@/components/admin/SociosDemographicsCard";
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
  const sociosStats = getSociosDemographicsStats(safe);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 lg:max-w-none lg:px-6 xl:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Administración · Socios</h1>
          <SociosDemographicsCard stats={sociosStats} />
        </div>
        {userCanManageSociosActions(currentUser) ? <AdminExcelActions /> : null}
      </div>

      <AdminUsersClient users={safe} currentUser={currentSafe} />
    </div>
  );
}
