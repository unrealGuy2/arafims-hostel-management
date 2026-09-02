import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = {
  title: "Dashboard | Arafims",
  description: "Your Arafims student dashboard",
};

export default async function DashboardPage() {
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

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, status, created_at, room_id, room_price, room:room_id(room_number, room_type, capacity, price, hostel:hostel_id(name, slug))"
    )
    .eq("student_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(3);

  async function handleSignOut() {
    "use server";
    const supabaseLogout = await createClient();
    await supabaseLogout.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
          <form action={handleSignOut}>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
          <h1 className="text-3xl font-bold font-display mb-2">
            Welcome, {profile.full_name}!
          </h1>
          <p className="text-[#b8b8b8] mb-8">
            Here's your Arafims dashboard.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-6">
              <h2 className="text-xl font-bold font-display mb-4">
                Student Profile
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-[#888] text-sm">Full Name</dt>
                  <dd className="text-[#f5f5f5]">{profile.full_name}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Email</dt>
                  <dd className="text-[#f5f5f5]">{profile.email}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Matric Number</dt>
                  <dd className="text-[#f5f5f5]">{profile.matric_number}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Level</dt>
                  <dd className="text-[#f5f5f5]">{profile.level}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Department</dt>
                  <dd className="text-[#f5f5f5]">{profile.department}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Faculty</dt>
                  <dd className="text-[#f5f5f5]">{profile.faculty}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Gender</dt>
                  <dd className="text-[#f5f5f5]">{profile.gender}</dd>
                </div>
                <div>
                  <dt className="text-[#888] text-sm">Previous Hostel</dt>
                  <dd className="text-[#f5f5f5]">{profile.previous_hostel}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-6">
              <h2 className="text-xl font-bold font-display mb-4">
                Profile Status
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#10a574] rounded-full" />
                  <span className="text-[#f5f5f5]">Account Created</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#10a574] rounded-full" />
                  <span className="text-[#f5f5f5]">Profile Complete</span>
                </div>
                {profile.admission_letter_path && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#10a574] rounded-full" />
                    <span className="text-[#f5f5f5]">
                      Admission Letter Uploaded
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 p-6 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-xl font-bold font-display">Reservation Status</h2>
              <Link
                href="/dashboard/reservations"
                className="inline-flex items-center rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c]"
              >
                Apply for a Room
              </Link>
            </div>

            {reservations && reservations.length > 0 ? (
              <div className="space-y-3">
                {reservations.map((reservation) => {
                  const room = Array.isArray(reservation.room)
                    ? reservation.room[0]
                    : reservation.room;
                  const hostel = Array.isArray(room?.hostel)
                    ? room.hostel[0]
                    : room?.hostel;

                  return (
                    <div
                      key={reservation.id}
                      className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-[#b8b8b8]">{hostel?.name}</p>
                          <p className="text-lg font-semibold text-[#f5f5f5]">
                            Room {room?.room_number}
                          </p>
                        </div>
                        <span className="rounded-full border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-1 text-xs font-medium uppercase tracking-wide text-[#f5f5f5]">
                          {reservation.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[#b8b8b8]">
                        {room?.room_type} · ₦{reservation.room_price} · Capacity{" "}
                        {room?.capacity}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[#b8b8b8]">
                No reservation applications yet.
              </p>
            )}
          </div>

          <div className="mt-8 p-6 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg">
            <h2 className="text-xl font-bold font-display mb-4">
              What's Next?
            </h2>
            <p className="text-[#b8b8b8] mb-4">
              Your profile is set up and ready. In the next phase of Arafims,
              you'll be able to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-[#b8b8b8]">
              <li>Browse available rooms</li>
              <li>Submit accommodation applications</li>
              <li>Track your application status</li>
              <li>Manage payments</li>
              <li>Submit complaints and feedback</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
