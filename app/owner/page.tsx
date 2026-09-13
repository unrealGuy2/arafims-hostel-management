import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordChangeForm } from "@/components/forms/PasswordChangeForm";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const reservationStatuses = ["pending", "approved", "rejected", "cancelled"];
const paymentStatuses = ["payment_pending", "proof_submitted", "confirmed", "rejected"];
const receiptStatuses = ["not_required", "required", "submitted", "approved", "rejected"];

export default async function OwnerPage() {
  const context = await getAuthorizationContext();
  if (!context || context.role !== "master_admin") redirect("/signin");
  const supabase = await createClient();
  const [{ count: studentCount }, { data: hostels }, ...reservationCounts] =
    await Promise.all([
      supabase.from("student_profiles").select("id", { count: "exact", head: true }),
      supabase.from("hostels").select("id, name").eq("active", true).order("name"),
      ...reservationStatuses.map((status) =>
        supabase.from("reservations").select("id", { count: "exact", head: true }).eq("status", status)
      ),
    ]);
  const paymentCounts = await Promise.all(
    paymentStatuses.map((status) =>
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("payment_status", status)
    )
  );
  const receiptCounts = await Promise.all(
    receiptStatuses.map((status) =>
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("payment_receipt_status", status)
    )
  );
  const reservationTotal = reservationCounts.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const summary = [
    ["Registered students", studentCount ?? 0],
    ["Applications", reservationTotal],
    ["Pending applications", reservationCounts[0]?.count ?? 0],
    ["Approved applications", reservationCounts[1]?.count ?? 0],
    ["Rejected applications", reservationCounts[2]?.count ?? 0],
    ["Cancelled applications", reservationCounts[3]?.count ?? 0],
    ["Proof awaiting review", paymentCounts[1]?.count ?? 0],
    ["Confirmed payments", paymentCounts[2]?.count ?? 0],
    ["Receipts awaiting review", receiptCounts[2]?.count ?? 0],
  ];
  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">Owner overview</p>
          <h1 className="mt-2 text-3xl font-bold font-display md:text-4xl">All hostel operations</h1>
          <p className="mt-3 text-[#b8b8b8]">Cross-hostel reporting for Arafims 1, Arafims 2 and Zamfara PG.</p>
          <div className="mt-6 flex flex-wrap gap-3" id="reports">
            <Link href="/owner/applications" className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]">View applications</Link>
            <Link href="/owner/payments" className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm font-semibold text-[#7ef1c6]">View payments</Link>
            <a href="/api/owner/export-approved-students" className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm">Export report</a>
          </div>
        </div>
        <div id="account"><PasswordChangeForm /></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map(([label, count]) => <div key={label} className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5"><p className="text-sm text-[#888]">{label}</p><p className="mt-2 text-3xl font-bold">{count}</p></div>)}
        </div>
        <section className="mt-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <h2 className="text-2xl font-bold">Hostels</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {(hostels ?? []).map((hostel) => <div key={hostel.id} className="rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-5"><h3 className="text-xl font-bold">{hostel.name}</h3><div className="mt-4 flex flex-wrap gap-2"><Link href={`/owner/applications?hostelId=${hostel.id}`} className="text-sm text-[#7ef1c6]">Applications</Link><Link href={`/owner/payments?hostelId=${hostel.id}`} className="text-sm text-[#7ef1c6]">Payments</Link></div></div>)}
          </div>
        </section>
      </div>
    </main>
  );
}
