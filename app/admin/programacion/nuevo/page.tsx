import Link from "next/link";
import { EventForm } from "@/components/admin/programacion/EventForm";

export const dynamic = "force-dynamic";

export default function NewEventPage() {
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
