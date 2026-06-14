import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { WorkerOnboardingForm } from "@/components/rrhh/WorkerOnboardingForm";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export const dynamic = "force-dynamic";

export default async function WorkerOnboardingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={72} priority />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Alta de trabajador</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Completa tus datos para crear tu acceso y tu ficha laboral. Tus datos
          se tratan de forma confidencial.
        </p>
      </div>
      <WorkerOnboardingForm token={token} />
    </div>
  );
}
