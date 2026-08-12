import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatUI from "@/components/ChatUI";

export default async function NewGoalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <ChatUI />;
}
