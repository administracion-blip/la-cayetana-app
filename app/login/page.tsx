import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { Logo } from "@/components/brand/Logo";

type Props = {
  searchParams: Promise<{ error?: string; reset?: string }>;
};

function errorMessage(code?: string): string | null {
  switch (code) {
    case "invalid":
      return "Email o contraseña incorrectos.";
    case "bad-input":
      return "Revisa el email y la contraseña.";
    case "pending":
      return "Tu cuenta está pendiente de validación de pago. Te avisaremos cuando esté lista.";
    case "inactive":
      return "Tu cuenta no está activa.";
    case "server":
      return "Error al iniciar sesión. Inténtalo de nuevo.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const initialError = errorMessage(sp.error);
  const successMessage =
    sp.reset === "ok"
      ? "Contraseña actualizada. Ya puedes entrar con la nueva."
      : null;

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-muted">
          Accede con el email y la contraseña de tu cuenta.
        </p>
      </div>
      <LoginForm initialError={initialError} successMessage={successMessage} />
    </div>
  );
}
