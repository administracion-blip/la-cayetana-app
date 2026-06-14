import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkerDocumentsManager } from "@/components/admin/rrhh/WorkerDocumentsManager";
import { WorkerProfileEditor } from "@/components/admin/rrhh/WorkerProfileEditor";
import { getAdminRrhhUserOrRedirect, userCanManageRrhh } from "@/lib/auth/admin";
import {
  getWorkerProfile,
  listWorkerDocuments,
  recordRrhhAccess,
} from "@/lib/repositories/rrhh";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ userId: string }> };

/**
 * Ficha completa del trabajador con datos sensibles. Solo accesible para
 * gestores (`canManageRrhh`); registra auditoría de acceso al abrir.
 */
export default async function WorkerDetailPage({ params }: Props) {
  const user = await getAdminRrhhUserOrRedirect();
  if (!userCanManageRrhh(user)) {
    redirect("/admin/rrhh/trabajadores");
  }

  const { userId } = await params;
  const profile = await getWorkerProfile(userId);

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/admin/rrhh/trabajadores"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a trabajadores
        </Link>
        <p className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted shadow-sm">
          No se ha encontrado la ficha de este trabajador.
        </p>
      </div>
    );
  }

  const documents = await listWorkerDocuments(userId);
  await recordRrhhAccess({
    userId,
    action: "view_profile",
    actorUserId: user.id,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin/rrhh/trabajadores"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Volver a trabajadores
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{profile.nameSnapshot}</h1>
        <p className="mt-1 text-xs text-muted">
          Datos confidenciales. El acceso queda registrado.
        </p>
      </div>

      <WorkerProfileEditor
        userId={userId}
        email={profile.emailSnapshot}
        initial={{
          dni: profile.dni,
          socialSecurityNumber: profile.socialSecurityNumber,
          iban: profile.iban,
          address: profile.address,
          city: profile.city,
          postalCode: profile.postalCode,
          position: profile.position ?? "",
        }}
      />

      <div className="mt-6">
        <WorkerDocumentsManager
          userId={userId}
          initialDocuments={documents.map((d) => ({
            docId: d.docId,
            side: d.side,
            contentType: d.contentType,
            uploadedAt: d.uploadedAt,
            source: d.source,
          }))}
        />
      </div>
    </div>
  );
}
