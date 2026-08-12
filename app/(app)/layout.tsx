import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id, status: "active" },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar goals={goals} userName={session.user.name ?? session.user.email} />
        <div className="h-screen flex-1 overflow-y-auto" style={{ minWidth: 0 }}>
          <div className="mx-auto max-w-[1200px] px-[44px] pb-[90px] pt-[34px]">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
