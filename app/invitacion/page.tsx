import Link from "next/link";
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";
import { Logo } from "@/components/brand/Logo";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export const dynamic = "force-dynamic";

export default async function InvitacionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Tu alta como socio</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Has recibido una invitación para unirte a La Cayetana. Completa tus
          datos para activar tu cuenta. No tienes que pagar nada.
        </p>
      </div>
      <AcceptInviteForm token={token} />
      <p className="mt-8 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-brand underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
