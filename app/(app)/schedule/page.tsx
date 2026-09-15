import { redirect } from "next/navigation";

// The calendar and the dashboard used to be separate pages showing the same
// week two ways. They are one page now; keep the old URL working.
export default function SchedulePage() {
  redirect("/dashboard");
}
