import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Profile | Arafims",
  description: "View your Arafims student profile",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const details = [
    ["Full name", profile.full_name],
    ["Email", profile.email],
    ["Matric number", profile.matric_number],
    ["Phone number", profile.phone_number],
    ["Level", profile.level],
    ["Department", profile.department],
    ["Faculty", profile.faculty],
    ["Gender", profile.gender],
    ["Age", profile.age],
    ["Previous hostel", profile.previous_hostel],
    ["Guardian name", profile.guardian_name],
    ["Guardian phone", profile.guardian_phone],
  ];

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Student account
          </p>
          <h1 className="mt-2 text-3xl font-bold font-display sm:text-4xl">
            Your profile
          </h1>
          <p className="mt-2 text-[#b8b8b8]">
            The information below is used for your accommodation application.
          </p>
        </div>

        <section className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-[#888]">{label}</dt>
                <dd className="mt-1 break-words text-[#f5f5f5]">
                  {value || "Not provided"}
                </dd>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3 border-t border-[#2a2a2a] pt-6">
            <Link
              href="/dashboard/documents"
              className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c]"
            >
              View documents
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#f5f5f5] transition-colors hover:border-[#10a574]/60"
            >
              Back to dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
