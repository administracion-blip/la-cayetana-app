import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Logo } from "@/components/brand/Logo";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Nueva contraseña</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Elige una contraseña segura (mínimo 8 caracteres).
        </p>
      </div>
      <ResetPasswordForm initialToken={token} />
    </div>
  );
}
