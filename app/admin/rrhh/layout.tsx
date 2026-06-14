import { getAdminRrhhUserOrRedirect } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminRrhhLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getAdminRrhhUserOrRedirect();
  return <>{children}</>;
}
