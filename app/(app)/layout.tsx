import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <ToastProvider>
      <div className="min-h-screen">
        <TopBar userName={session.user.name ?? session.user.email} />
        <main className="mx-auto max-w-[1160px] px-8 pb-24 pt-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
