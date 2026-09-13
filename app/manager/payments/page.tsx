import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export default async function ManagerPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthorizationContext();

  if (!context || (context.role !== "manager" && context.role !== "master_admin")) {
    redirect("/signin");
  }
  if (context.mustChangePassword) {
    redirect("/manager/change-password");
  }

  const supabase = await createClient();
  const params = (await searchParams) ?? {};
  const selectedHostelId =
    context.role === "manager"
      ? context.assignedHostelId
      : typeof params.hostelId === "string"
        ? params.hostelId
        : undefined;
  const { data: hostels } = await supabase
    .from("hostels")
    .select("id, name")
    .order("name");
  const hostel =
    (hostels ?? []).find((item) => item.id === selectedHostelId) ??
    (context.role === "master_admin" ? hostels?.[0] : null);

  if (!hostel) {
    redirect("/signin");
  }

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id")
    .eq("hostel_id", hostel.id);
  const roomIds = (rooms ?? []).map((room) => room.id);
  const { data: paymentReservations } = roomIds.length
    ? await supabase
        .from("reservations")
        .select(
          "id, created_at, student_profiles(full_name, matric_number), rooms(room_number, room_type), payments(id, amount_expected, amount_paid, payment_status, payment_receipt_status, payment_reference, payment_proof_path, payment_receipt_path, submitted_at, verified_at, payment_account:payment_account_id(bank_name, account_name, account_number), receipt:payment_receipts(receipt_number, receipt_date, payment_method))"
        )
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-12 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/manager" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/manager"
              className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm transition-colors hover:border-[#10a574]/60"
            >
              Manager Dashboard
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm transition-colors hover:border-[#10a574]/60"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        {context.role === "master_admin" && (
          <form method="get" className="mb-8 flex flex-wrap items-end gap-3">
            <label className="text-sm text-[#b8b8b8]">
              Hostel
              <select
                name="hostelId"
                defaultValue={hostel.id}
                className="mt-1 block rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-[#f5f5f5]"
              >
                {(hostels ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm text-[#7ef1c6]">
              View hostel
            </button>
          </form>
        )}

        <section className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Manager payment history
          </p>
          <h1 className="text-3xl font-bold font-display">{hostel.name}</h1>
          <p className="mt-3 text-[#b8b8b8]">
            Review payments and available payment documents for this hostel.
          </p>
          <div className="mt-5 space-y-3">
            {(paymentReservations ?? []).flatMap((reservation) => {
              const student = Array.isArray(reservation.student_profiles)
                ? reservation.student_profiles[0]
                : reservation.student_profiles;
              const room = Array.isArray(reservation.rooms)
                ? reservation.rooms[0]
                : reservation.rooms;
              const payment = Array.isArray(reservation.payments)
                ? reservation.payments[0]
                : reservation.payments;
              if (!payment) {
                return [];
              }
              const receipt = Array.isArray(payment.receipt)
                ? payment.receipt[0]
                : payment.receipt;
              const account = Array.isArray(payment.payment_account)
                ? payment.payment_account[0]
                : payment.payment_account;
              const paymentDate =
                payment.verified_at ?? payment.submitted_at ?? reservation.created_at;

              return (
                <div
                  key={payment.id}
                  className="rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{student?.full_name}</p>
                      <p className="text-sm text-[#b8b8b8]">
                        {student?.matric_number} · Room {room?.room_number}
                      </p>
                    </div>
                    <span className="text-sm text-[#f5d5a4]">
                      {payment.payment_status === "proof_submitted"
                        ? "Payment proof awaiting verification"
                        : payment.payment_status === "confirmed"
                          ? payment.payment_receipt_status === "submitted"
                            ? "Arafims receipt awaiting final verification"
                            : payment.payment_receipt_status === "approved"
                              ? "Arafims receipt approved"
                              : payment.payment_receipt_status === "rejected"
                                ? "Arafims receipt rejected"
                                : "Payment confirmed · Arafims receipt required"
                          : payment.payment_status}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-[#888]">Date</dt>
                      <dd>{new Date(paymentDate).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-[#888]">Amount</dt>
                      <dd>
                        {formatCurrency(
                          Number(payment.amount_paid ?? payment.amount_expected)
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#888]">Method</dt>
                      <dd>
                        {receipt?.payment_method ?? account?.bank_name ?? "Not available"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#888]">Receipt verification</dt>
                      <dd>
                        {payment.payment_receipt_status === "required"
                          ? "Required"
                          : payment.payment_receipt_status === "submitted"
                            ? "Awaiting review"
                            : payment.payment_receipt_status === "approved"
                              ? "Approved"
                              : payment.payment_receipt_status === "rejected"
                                ? "Rejected"
                                : "Not required"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {receipt && (
                      <Link
                        href={`/api/payments/${payment.id}/receipt`}
                        target="_blank"
                        className="rounded-lg bg-[#10a574] px-3 py-2 font-semibold text-[#0f0f0f]"
                      >
                        Download Receipt
                      </Link>
                    )}
                    {payment.payment_proof_path && (
                      <Link
                        href={`/api/manager/payments/${payment.id}/proof`}
                        target="_blank"
                        className="rounded-lg border border-[#10a574]/40 px-3 py-2 text-[#7ef1c6]"
                      >
                        View Payment Proof
                      </Link>
                    )}
                    {payment.payment_receipt_path && (
                      <Link
                        href={`/api/manager/payments/${payment.id}/receipt`}
                        target="_blank"
                        className="rounded-lg border border-[#d4a574]/40 px-3 py-2 text-[#f5d5a4]"
                      >
                        View Uploaded Receipt
                      </Link>
                    )}
                    {payment.payment_receipt_status === "submitted" && (
                      <>
                        <form action={`/api/manager/payments/${payment.id}`} method="post">
                          <input type="hidden" name="action" value="approve_receipt" />
                          <button className="rounded-lg bg-[#10a574] px-3 py-2 font-semibold text-[#0f0f0f]">
                            Approve Receipt
                          </button>
                        </form>
                        <form action={`/api/manager/payments/${payment.id}`} method="post">
                          <input type="hidden" name="action" value="reject_receipt" />
                          <button className="rounded-lg border border-red-400/40 px-3 py-2 text-red-200">
                            Reject Receipt
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {(paymentReservations ?? []).every(
              (reservation) => !reservation.payments?.length
            ) && (
              <p className="text-sm text-[#b8b8b8]">
                No payment history available.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
