import Link from "next/link";
import { EventForm } from "@/components/admin/programacion/EventForm";
import { getAdminProgramacionUserOrRedirect } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await getAdminProgramacionUserOrRedirect();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/admin/programacion"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Programación
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Nuevo evento</h1>
      </div>
      <EventForm />
    </div>
  );
}
