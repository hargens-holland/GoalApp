import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ScheduleView from "@/components/ScheduleView";

export default async function SchedulePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <ScheduleView />;
}
