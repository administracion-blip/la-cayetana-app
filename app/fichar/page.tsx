import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { FicharClient } from "@/components/rrhh/FicharClient";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getUserById } from "@/lib/repositories/users";

type Props = { searchParams: Promise<{ t?: string }> };

export const dynamic = "force-dynamic";

export default async function FicharPage({ searchParams }: Props) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  const user = await getUserById(session.sub);
  if (!user) redirect("/login");

  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";

  return (
    <div className="flex min-h-full flex-col px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="La Cayetana Granada">
          <Logo height={64} priority />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Fichaje</h1>
      </div>

      {user.isWorker ? (
        <FicharClient token={token} workerName={user.name} />
      ) : (
        <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">Esta cuenta no es de trabajador</p>
          <p className="mt-1">
            Solo el personal dado de alta como trabajador puede fichar. Si crees
            que es un error, contacta con RRHH.
          </p>
        </div>
      )}
    </div>
  );
}
