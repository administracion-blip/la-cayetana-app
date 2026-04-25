import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { Logo } from "@/components/brand/Logo";
import { isLoginClosed } from "@/lib/access-gates";

export const dynamic = "force-dynamic";

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
    case "closed":
      return "El inicio de sesión está temporalmente cerrado.";
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
  const loginClosed = await isLoginClosed();

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
      {loginClosed ? (
        <div
          role="status"
          className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-muted/30 p-6 text-center text-sm text-foreground"
        >
          <p>El inicio de sesión está temporalmente cerrado.</p>
          <p className="mt-2 text-xs text-muted">
            Si eres administrador del club, puedes seguir accediendo desde el
            formulario.
          </p>
          <details className="mt-4 text-left text-xs">
            <summary className="cursor-pointer text-muted">
              Acceso solo para personal
            </summary>
            <div className="mt-3">
              <LoginForm
                initialError={initialError}
                successMessage={successMessage}
              />
            </div>
          </details>
        </div>
      ) : (
        <LoginForm
          initialError={initialError}
          successMessage={successMessage}
        />
      )}
    </div>
  );
}
