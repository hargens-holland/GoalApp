import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import ChatPanel from "@/components/ChatPanel";
import { AssistantProvider } from "@/components/AssistantProvider";
import { ToastProvider } from "@/components/Toast";
import { isAdmin } from "@/lib/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <ToastProvider>
      <AssistantProvider>
        <div className="min-h-screen">
          <TopBar userName={session.user.name ?? session.user.email} isAdmin={isAdmin(session.user.email)} />
          <main className="mx-auto max-w-[1160px] px-8 pb-24 pt-8">{children}</main>
        </div>
        <ChatPanel />
      </AssistantProvider>
    </ToastProvider>
  );
}
