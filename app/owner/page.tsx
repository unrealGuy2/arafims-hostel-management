import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export default async function OwnerPage() {
  const context = await getAuthorizationContext();

  if (!context || context.role !== "master_admin") {
    redirect("/signin");
  }

  const supabase = await createClient();
  const [{ count: studentCount }, { data: reservations }, { data: hostels }] =
    await Promise.all([
      supabase.from("student_profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("reservations")
        .select("id, status, room_price, room:rooms(hostel_id, capacity)")
        .order("created_at", { ascending: false }),
      supabase.from("hostels").select("id, name").eq("active", true).order("name"),
    ]);

  const allReservations = reservations ?? [];
  const totals = {
    pending: allReservations.filter((item) => item.status === "pending").length,
    approved: allReservations.filter((item) => item.status === "approved").length,
    rejected: allReservations.filter((item) => item.status === "rejected").length,
  };

  const hostelStats = (hostels ?? []).map((hostel) => {
    const hostelReservations = allReservations.filter((reservation) => {
      const room = Array.isArray(reservation.room) ? reservation.room[0] : reservation.room;
      return room?.hostel_id === hostel.id;
    });
    return {
      ...hostel,
      total: hostelReservations.length,
      pending: hostelReservations.filter((item) => item.status === "pending").length,
      approved: hostelReservations.filter((item) => item.status === "approved").length,
      rejected: hostelReservations.filter((item) => item.status === "rejected").length,
      approvedOccupancy: hostelReservations.filter((item) => item.status === "approved").length,
    };
  });

  const summary = [
    ["Registered students", studentCount ?? 0],
    ["Total reservations", allReservations.length],
    ["Pending reservations", totals.pending],
    ["Approved reservations", totals.approved],
    ["Rejected reservations", totals.rejected],
  ];

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-4 py-12 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="text-2xl font-bold text-[#10a574]">Arafims</Link>
          <Link href="/dashboard" className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm transition-colors hover:border-[#10a574]/60">
            Back to dashboard
          </Link>
        </div>
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-[#d4a574]">Owner dashboard</p>
          <h1 className="text-3xl font-bold font-display md:text-4xl">Hostel overview</h1>
          <p className="mt-3 text-[#b8b8b8]">Cross-hostel reservation and occupancy overview.</p>
          <a
            href="/api/owner/export-approved-students"
            className="mt-6 inline-flex rounded-lg bg-[#10a574] px-5 py-2.5 text-sm font-semibold text-[#0f0f0f]"
          >
            Export Approved Students
          </a>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <p className="text-sm text-[#888]">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {hostelStats.map((hostel) => (
            <div key={hostel.id} className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
              <h2 className="text-2xl font-bold">{hostel.name}</h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-[#888]">Reservations</dt><dd>{hostel.total}</dd></div>
                <div className="flex justify-between"><dt className="text-[#888]">Pending</dt><dd>{hostel.pending}</dd></div>
                <div className="flex justify-between"><dt className="text-[#888]">Approved</dt><dd>{hostel.approved}</dd></div>
                <div className="flex justify-between"><dt className="text-[#888]">Rejected</dt><dd>{hostel.rejected}</dd></div>
                <div className="flex justify-between"><dt className="text-[#888]">Approved occupancy</dt><dd>{hostel.approvedOccupancy}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
