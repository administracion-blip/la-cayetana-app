import Link from "next/link";
import { Suspense } from "react";
import { SuccessRedirect } from "@/components/success/SuccessRedirect";

function Fallback() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="text-muted">Cargando…</p>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 text-center">
        <Link href="/" className="text-lg font-semibold">
          La Cayetana
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">Resultado del pago</h1>
      </div>
      <Suspense fallback={<Fallback />}>
        <SuccessRedirect />
      </Suspense>
    </div>
  );
}
