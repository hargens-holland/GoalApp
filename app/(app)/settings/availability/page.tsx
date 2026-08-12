import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AvailabilityForm from "@/components/AvailabilityForm";

export default async function AvailabilityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <AvailabilityForm />;
}
