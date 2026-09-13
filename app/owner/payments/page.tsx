import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const paymentStatuses = ["payment_pending", "proof_submitted", "confirmed", "rejected"];
const receiptStatuses = ["not_required", "required", "submitted", "approved", "rejected"];

export default async function OwnerPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthorizationContext();
  if (!context || context.role !== "master_admin") redirect("/signin");
  const params = (await searchParams) ?? {};
  const hostelId = typeof params.hostelId === "string" ? params.hostelId : "";
  const paymentStatus = typeof params.paymentStatus === "string" ? params.paymentStatus : "";
  const receiptStatus = typeof params.receiptStatus === "string" ? params.receiptStatus : "";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "") || 1);
  const pageSize = 25;
  const supabase = await createClient();
  const { data: hostels } = await supabase.from("hostels").select("id, name").eq("active", true).order("name");
  let query = supabase
    .from("payments")
    .select("id, amount_expected, amount_paid, payment_status, payment_receipt_status, payment_reference, payment_proof_path, payment_receipt_path, submitted_at, verified_at, created_at, receipt:payment_receipts(receipt_number, receipt_date), reservation:reservation_id!inner(id, student_profile_id, room:room_id!inner(room_number, room_type, hostel_id, hostel:hostel_id!inner(id, name)), student:student_profile_id!inner(full_name, matric_number, email, phone_number))", { count: "exact" });
  if (hostelId && hostels?.some((hostel) => hostel.id === hostelId)) query = query.eq("reservation.room.hostel_id", hostelId);
  if (paymentStatuses.includes(paymentStatus)) query = query.eq("payment_status", paymentStatus);
  if (receiptStatuses.includes(receiptStatus)) query = query.eq("payment_receipt_status", receiptStatus);
  const { data: payments, count } = await query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const paramsForPage = (nextPage: number) => new URLSearchParams({ ...(hostelId ? { hostelId } : {}), ...(paymentStatus ? { paymentStatus } : {}), ...(receiptStatus ? { receiptStatus } : {}), page: String(nextPage) }).toString();

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6"><p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">Owner payments</p><h1 className="mt-2 text-3xl font-bold font-display">Cross-hostel payment records</h1></div>
        <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-4">
          <label className="text-sm text-[#b8b8b8]">Hostel<select name="hostelId" defaultValue={hostelId} className="mt-1 block rounded-lg bg-[#0f0f0f] p-2"><option value="">All hostels</option>{(hostels ?? []).map((hostel) => <option key={hostel.id} value={hostel.id}>{hostel.name}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Payment<select name="paymentStatus" defaultValue={paymentStatus} className="mt-1 block rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option>{paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="text-sm text-[#b8b8b8]">Receipt<select name="receiptStatus" defaultValue={receiptStatus} className="mt-1 block rounded-lg bg-[#0f0f0f] p-2"><option value="">All</option>{receiptStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <button className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]">Apply filters</button>
        </form>
        <div className="space-y-3">{(payments ?? []).map((record) => {
          const reservation = Array.isArray(record.reservation) ? record.reservation[0] : record.reservation;
          const room = Array.isArray(reservation?.room) ? reservation.room[0] : reservation?.room;
          const hostel = Array.isArray(room?.hostel) ? room.hostel[0] : room?.hostel;
          const student = Array.isArray(reservation?.student) ? reservation.student[0] : reservation?.student;
          const receipt = Array.isArray(record.receipt) ? record.receipt[0] : record.receipt;
          return <section key={record.id} className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/owner/students/${reservation?.student_profile_id}`} className="font-semibold text-[#7ef1c6] hover:underline">{student?.full_name}</Link><p className="text-sm text-[#b8b8b8]">{student?.matric_number} · {hostel?.name} · Room {room?.room_number}</p></div><span className="text-sm text-[#f5d5a4]">{record.payment_status}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><div><dt className="text-[#888]">Amount</dt><dd>{Number(record.amount_paid ?? record.amount_expected).toLocaleString("en-NG", { style: "currency", currency: "NGN" })}</dd></div><div><dt className="text-[#888]">Receipt status</dt><dd>{record.payment_receipt_status}</dd></div><div><dt className="text-[#888]">Submitted</dt><dd>{record.submitted_at ? new Date(record.submitted_at).toLocaleString() : "—"}</dd></div><div><dt className="text-[#888]">Confirmed</dt><dd>{record.verified_at ? new Date(record.verified_at).toLocaleString() : "—"}</dd></div><div><dt className="text-[#888]">Reference</dt><dd>{record.payment_reference ?? "—"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2 text-sm">{record.payment_proof_path && <Link href={`/api/manager/payments/${record.id}/proof`} target="_blank" className="rounded border border-[#2a2a2a] px-3 py-2">View payment proof</Link>}{receipt && <Link href={`/api/payments/${record.id}/receipt`} target="_blank" className="rounded bg-[#10a574] px-3 py-2 font-semibold text-[#0f0f0f]">Download official receipt</Link>}{record.payment_receipt_path && <Link href={`/api/manager/payments/${record.id}/receipt`} target="_blank" className="rounded border border-[#d4a574]/40 px-3 py-2 text-[#f5d5a4]">View uploaded receipt</Link>}{record.payment_status === "proof_submitted" && <form action={`/api/manager/payments/${record.id}`} method="post"><input type="hidden" name="action" value="confirm" /><input type="hidden" name="redirectTo" value="/owner/payments" /><button className="rounded bg-[#10a574] px-3 py-2 font-semibold text-[#0f0f0f]">Confirm payment</button></form>}{record.payment_receipt_status === "submitted" && <><form action={`/api/manager/payments/${record.id}`} method="post"><input type="hidden" name="action" value="approve_receipt" /><input type="hidden" name="redirectTo" value="/owner/payments" /><button className="rounded bg-[#10a574] px-3 py-2 font-semibold text-[#0f0f0f]">Approve receipt</button></form><form action={`/api/manager/payments/${record.id}`} method="post"><input type="hidden" name="action" value="reject_receipt" /><input type="hidden" name="redirectTo" value="/owner/payments" /><button className="rounded border border-red-400/40 px-3 py-2 text-red-200">Reject receipt</button></form></>}</div></section>;
        })}{(!payments || payments.length === 0) && <p className="rounded-2xl border border-[#2a2a2a] p-6 text-[#b8b8b8]">No payments match these filters.</p>}</div>
        <div className="mt-4 flex justify-between text-sm text-[#b8b8b8]"><span>Page {page} of {totalPages} ({count ?? 0} results)</span><div className="flex gap-2">{page > 1 && <Link href={`/owner/payments?${paramsForPage(page - 1)}`} className="rounded border border-[#2a2a2a] px-3 py-2">Previous</Link>}{page < totalPages && <Link href={`/owner/payments?${paramsForPage(page + 1)}`} className="rounded border border-[#2a2a2a] px-3 py-2">Next</Link>}</div></div>
      </div>
    </main>
  );
}
