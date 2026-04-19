import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/admin/programacion/EventForm";
import { getEventById } from "@/lib/repositories/programacion";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/admin/programacion"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Programación
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Editar evento</h1>
      </div>
      <EventForm initial={event} />
    </div>
  );
}
