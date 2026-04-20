import Link from "next/link";
import { RegistrationForm } from "@/components/auth/RegistrationForm";
import { Logo } from "@/components/brand/Logo";
import { isCarnetPurchaseClosed } from "@/lib/carnet-purchase-deadline";

export default function RegistroPage() {
  const comprasCerradas = isCarnetPurchaseClosed();

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
        {comprasCerradas ? (
          <p
            className="mt-6 max-w-md rounded-xl border border-border bg-muted/30 px-4 py-3 text-left text-sm text-foreground"
            role="status"
          >
            El plazo para <strong>nuevas altas</strong> en línea ha finalizado.
            Si <strong>ya eres socio</strong> y debes renovar, introduce el mismo
            email que usas en el club y completa el pago; si no, escríbenos a
            lacayetanagranada@gmail.com
          </p>
        ) : null}
        <h1 className="mt-6 text-2xl font-semibold">Consigue tu carnet</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Completa tus datos. Después se abrirá el pago seguro de Stripe; tu
          cuenta se creará solo si el pago se realiza correctamente.
        </p>
      </div>
      <RegistrationForm />
      <p className="mt-8 text-center text-sm text-muted">
        ¿Ya tienes carnet?{" "}
        <Link href="/login" className="text-brand underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
