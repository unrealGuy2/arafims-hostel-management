import { StudentNavigation } from "@/components/layout/Navigation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("student_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const { data: activeReservation } = profile
    ? await supabase
        .from("reservations")
        .select("id")
        .eq("student_profile_id", profile.id)
        .neq("status", "rejected")
        .limit(1)
        .maybeSingle()
    : { data: null };

  async function handleSignOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f5f5f5]">
      <StudentNavigation
        signOutAction={handleSignOut}
        hasActiveReservation={Boolean(activeReservation)}
      />
      {children}
    </div>
  );
}
