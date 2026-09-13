import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const reservationStatuses = ["pending", "approved", "rejected", "cancelled"];
const paymentStatuses = ["payment_pending", "proof_submitted", "confirmed", "rejected"];
const receiptStatuses = ["not_required", "required", "submitted", "approved", "rejected"];

function value(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] : "";
}

function queryString(values: Record<string, string>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, item]) => {
    if (item) query.set(key, item);
  });
  return query.toString();
}

export default async function OwnerApplicationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthorizationContext();
  if (!context || context.role !== "master_admin") redirect("/signin");

  const params = (await searchParams) ?? {};
  const filters = {
    hostelId: value(params, "hostelId"),
    reservationStatus: value(params, "reservationStatus"),
    paymentStatus: value(params, "paymentStatus"),
    receiptStatus: value(params, "receiptStatus"),
    studentType: value(params, "studentType"),
    gender: value(params, "gender"),
    level: value(params, "level"),
    roomNumber: value(params, "roomNumber"),
    search: value(params, "search").trim(),
    page: Math.max(1, Number(value(params, "page")) || 1),
  };
  const pageSize = 25;
  const supabase = await createClient();
  const { data: hostels } = await supabase
    .from("hostels")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const paymentRelation = filters.paymentStatus || filters.receiptStatus ? "payments!inner" : "payments";
  let query = supabase
    .from("reservations")
    .select(
      `id, status, created_at, room_price, student_profile_id, student_profiles!inner(id, full_name, email, phone_number, matric_number, gender, level, school_id_path), rooms!inner(id, room_number, room_type, hostel_id, hostels!inner(id, name)), ${paymentRelation}(id, payment_status, payment_receipt_status)`,
      { count: "exact" }
    );

  if (filters.hostelId && hostels?.some((hostel) => hostel.id === filters.hostelId)) {
    query = query.eq("rooms.hostel_id", filters.hostelId);
  }
  if (reservationStatuses.includes(filters.reservationStatus)) {
    query = query.eq("status", filters.reservationStatus);
  }
  if (paymentStatuses.includes(filters.paymentStatus)) {
    query = query.eq("payments.payment_status", filters.paymentStatus);
  }
  if (receiptStatuses.includes(filters.receiptStatus)) {
    query = query.eq("payments.payment_receipt_status", filters.receiptStatus);
  }
  if (filters.studentType === "new") {
    query = query.is("student_profiles.school_id_path", null);
  } else if (filters.studentType === "returning") {
    query = query.not("student_profiles.school_id_path", "is", null);
  }
  if (filters.gender === "MALE" || filters.gender === "FEMALE") {
    query = query.eq("student_profiles.gender", filters.gender);
  }
  if (["100", "200", "300", "400", "500", "600"].includes(filters.level)) {
    query = query.eq("student_profiles.level", Number(filters.level));
  }
  if (filters.roomNumber) {
    query = query.ilike("rooms.room_number", `%${filters.roomNumber}%`);
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[%(),]/g, " ");
    query = query.or(
      `full_name.ilike.%${escaped}%,matric_number.ilike.%${escaped}%,email.ilike.%${escaped}%,phone_number.ilike.%${escaped}%`,
      { foreignTable: "student_profiles" }
    );
  }

  const { data: reservations, count } = await query
    .order("created_at", { ascending: false })
    .range((filters.page - 1) * pageSize, filters.page * pageSize - 1);
  const rows = reservations ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const base = { ...filters, page: "" };

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">Owner applications</p>
            <h1 className="mt-2 text-3xl font-bold font-display">All hostel applications</h1>
          </div>
          <a
            href={`/api/owner/export-approved-students?${queryString(base)}`}
            className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]"
          >
            Export filtered results
          </a>
        </div>
        <form method="get" className="grid gap-3 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-4 md:grid-cols-4 lg:grid-cols-6">
          <label className="text-sm text-[#b8b8b8]">Hostel<select name="hostelId" defaultValue={filters.hostelId} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All hostels</option>{(hostels ?? []).map((hostel) => <option key={hostel.id} value={hostel.id}>{hostel.name}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Reservation<select name="reservationStatus" defaultValue={filters.reservationStatus} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option>{reservationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Payment<select name="paymentStatus" defaultValue={filters.paymentStatus} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option>{paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Receipt<select name="receiptStatus" defaultValue={filters.receiptStatus} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option>{receiptStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Student type<select name="studentType" defaultValue={filters.studentType} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option><option value="new">New</option><option value="returning">Returning</option></select></label>
          <label className="text-sm text-[#b8b8b8]">Gender<select name="gender" defaultValue={filters.gender} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
          <label className="text-sm text-[#b8b8b8]">Level<select name="level" defaultValue={filters.level} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option>{[100,200,300,400,500,600].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Room<input name="roomNumber" defaultValue={filters.roomNumber} className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2" /></label>
          <label className="text-sm text-[#b8b8b8] md:col-span-2">Search<input name="search" defaultValue={filters.search} placeholder="Name, matric, email or phone" className="mt-1 w-full rounded-lg bg-[#0f0f0f] p-2" /></label>
          <button className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]">Apply filters</button>
        </form>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a]">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-[#2a2a2a] text-[#888]"><tr>{["Student","Hostel / room","Gender","Level","Application","Payment","Receipt","Date"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
            <tbody>{rows.map((reservation) => {
              const student = Array.isArray(reservation.student_profiles) ? reservation.student_profiles[0] : reservation.student_profiles;
              const room = Array.isArray(reservation.rooms) ? reservation.rooms[0] : reservation.rooms;
              const hostel = Array.isArray(room?.hostels) ? room.hostels[0] : room?.hostels;
              const payment = Array.isArray(reservation.payments) ? reservation.payments[0] : reservation.payments;
              return <tr key={reservation.id} className="border-b border-[#2a2a2a] last:border-0"><td className="px-4 py-3"><Link href={`/owner/students/${reservation.student_profile_id}`} className="font-semibold text-[#7ef1c6] hover:underline">{student?.full_name}</Link><p className="text-[#888]">{student?.matric_number}</p></td><td className="px-4 py-3">{hostel?.name}<p className="text-[#888]">Room {room?.room_number}</p></td><td className="px-4 py-3">{student?.gender}</td><td className="px-4 py-3">{student?.level}</td><td className="px-4 py-3">{reservation.status}{reservation.status === "pending" && <div className="mt-2 flex gap-2"><form action={`/api/manager/reservations/${reservation.id}`} method="post"><input type="hidden" name="action" value="approve" /><input type="hidden" name="redirectTo" value="/owner/applications" /><button className="rounded bg-[#10a574] px-2 py-1 text-xs font-semibold text-[#0f0f0f]">Approve</button></form><form action={`/api/manager/reservations/${reservation.id}`} method="post"><input type="hidden" name="action" value="reject" /><input type="hidden" name="redirectTo" value="/owner/applications" /><button className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-200">Reject</button></form></div>}</td><td className="px-4 py-3">{payment?.payment_status ?? "—"}</td><td className="px-4 py-3">{payment?.payment_receipt_status ?? "—"}</td><td className="px-4 py-3">{new Date(reservation.created_at).toLocaleDateString()}</td></tr>;
            })}</tbody>
          </table>
          {rows.length === 0 && <p className="p-6 text-[#b8b8b8]">No applications match these filters.</p>}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-[#b8b8b8]"><span>Page {filters.page} of {totalPages} ({count ?? 0} results)</span><div className="flex gap-2">{filters.page > 1 && <Link href={`/owner/applications?${queryString({...base, page: String(filters.page - 1)})}`} className="rounded border border-[#2a2a2a] px-3 py-2">Previous</Link>}{filters.page < totalPages && <Link href={`/owner/applications?${queryString({...base, page: String(filters.page + 1)})}`} className="rounded border border-[#2a2a2a] px-3 py-2">Next</Link>}</div></div>
      </div>
    </main>
  );
}
