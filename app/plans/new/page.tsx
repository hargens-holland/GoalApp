import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatUI from "@/components/ChatUI";
import Link from "next/link";

export default async function NewPlanPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="btn-ghost text-sm px-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <span className="text-zinc-600 text-sm">|</span>
          <span className="text-sm font-medium text-zinc-300">New plan</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Create a plan</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Tell us your goal and AI will build a personalized weekly task plan.
          </p>
        </div>
        <ChatUI />
      </main>
    </div>
  );
}
