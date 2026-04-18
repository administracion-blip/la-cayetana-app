import Link from "next/link";

export default function AdminExportPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Exportar socios</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Descarga un CSV con membershipId, nombre, email, teléfono, fecha de alta
        y estado para importar en Agora.
      </p>
      <a
        href="/api/admin/export"
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-8 text-[15px] font-medium text-white hover:bg-brand-hover"
        download
      >
        Descargar CSV
      </a>
      <div className="mt-10">
        <Link href="/admin/users" className="text-sm text-brand underline">
          Volver al listado
        </Link>
      </div>
    </div>
  );
}
