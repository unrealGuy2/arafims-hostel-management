import { StudentNavigation } from "@/components/layout/Navigation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  async function handleSignOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f5f5f5]">
      <StudentNavigation signOutAction={handleSignOut} />
      {children}
    </div>
  );
}
