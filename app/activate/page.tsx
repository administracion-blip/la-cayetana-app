import Link from "next/link";
import { ActivateForm } from "@/components/auth/ActivateForm";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function ActivatePage({ searchParams }: Props) {
  const sp = await searchParams;
  const sessionId = sp.session_id;

  if (!sessionId) {
    return (
      <div className="flex min-h-full flex-col px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-muted">
            Falta la referencia de pago. Vuelve desde el enlace que recibiste
            tras pagar en Stripe.
          </p>
          <Link href="/" className="mt-6 inline-block text-brand underline">
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 text-center">
        <Link href="/" className="text-lg font-semibold">
          La Cayetana
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">Activa tu cuenta</h1>
        <p className="mt-2 text-sm text-muted">
          El pago está confirmado. Completa tus datos para generar tu número de
          socio.
        </p>
      </div>
      <ActivateForm sessionId={sessionId} />
    </div>
  );
}
