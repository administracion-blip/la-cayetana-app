import Link from "next/link";
import { RegistrationForm } from "@/components/auth/RegistrationForm";
import { Logo } from "@/components/brand/Logo";

export default function RegistroPage() {
  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
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
