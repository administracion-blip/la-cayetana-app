import { getAdminUserOrRedirect } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getAdminUserOrRedirect();
  return <>{children}</>;
}
