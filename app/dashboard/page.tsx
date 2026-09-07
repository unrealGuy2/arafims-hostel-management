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
      "id, status, created_at, room_price, room:room_id(room_number, room_type, hostel:hostel_id(name)), payment:payments(payment_status)"
    )
    .eq("student_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const hasActiveReservation = (reservations ?? []).some(
    (reservation) =>
      reservation.status === "pending" || reservation.status === "approved"
  );

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Student dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold font-display sm:text-4xl">
            Welcome, {profile.full_name}
          </h1>
          <p className="mt-2 text-[#b8b8b8]">
            Manage your accommodation application and student records.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
            <p className="text-sm text-[#888]">Profile</p>
            <p className="mt-2 text-xl font-semibold text-[#7ef1c6]">Complete</p>
          </div>
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
            <p className="text-sm text-[#888]">Applications</p>
            <p className="mt-2 text-xl font-semibold">
              {reservations?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
            <p className="text-sm text-[#888]">Current status</p>
            <p className="mt-2 text-xl font-semibold">
              {hasActiveReservation ? "In progress" : "No active application"}
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
                Quick actions
              </p>
              <h2 className="mt-2 text-2xl font-bold font-display">
                What would you like to do?
              </h2>
            </div>
            {!hasActiveReservation && (
              <Link
                href="/dashboard/reservations"
                className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c]"
              >
                Apply for a room
              </Link>
            )}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                href: "/dashboard/reservations",
                title: "Reservations",
                description: "Apply for a room and track applications.",
              },
              {
                href: "/dashboard/profile",
                title: "Profile",
                description: "Review your student information.",
              },
              {
                href: "/dashboard/payments",
                title: "Payments",
                description: "Submit proof and view receipts.",
              },
              {
                href: "/dashboard/documents",
                title: "Documents",
                description: "Access your uploaded documents.",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4 transition-colors hover:border-[#10a574]/60"
              >
                <h3 className="font-semibold">{link.title}</h3>
                <p className="mt-2 text-sm text-[#b8b8b8]">{link.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold font-display">Recent reservations</h2>
            <Link
              href="/dashboard/reservations"
              className="text-sm text-[#7ef1c6] hover:text-[#1ec98c]"
            >
              View reservation flow
            </Link>
          </div>
          {reservations && reservations.length > 0 ? (
            <div className="mt-5 space-y-3">
              {reservations.map((reservation) => {
                const room = Array.isArray(reservation.room)
                  ? reservation.room[0]
                  : reservation.room;
                const hostel = room?.hostel
                  ? Array.isArray(room.hostel)
                    ? room.hostel[0]
                    : room.hostel
                  : null;

                return (
                  <div
                    key={reservation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4"
                  >
                    <div>
                      <p className="text-sm text-[#b8b8b8]">{hostel?.name}</p>
                      <p className="mt-1 font-semibold">
                        Room {room?.room_number ?? "Pending assignment"}
                      </p>
                    </div>
                    <span className="rounded-full border border-[#2a2a2a] px-3 py-1 text-xs font-medium uppercase tracking-wide">
                      {reservation.status}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-[#b8b8b8]">No reservation applications yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
