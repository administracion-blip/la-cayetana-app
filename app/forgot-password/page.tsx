import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Logo } from "@/components/brand/Logo";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Recuperar contraseña</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Te enviaremos un enlace por email para elegir una nueva contraseña
          (válido 1 hora).
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
