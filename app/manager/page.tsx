import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export default async function ManagerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthorizationContext();

  if (!context || context.role !== "manager" || !context.assignedHostelId) {
    redirect("/signin");
  }

  const supabase = await createClient();
  const { data: hostel } = await supabase
    .from("hostels")
    .select("id, name")
    .eq("id", context.assignedHostelId)
    .single();

  if (!hostel) {
    redirect("/signin");
  }

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id")
    .eq("hostel_id", hostel.id);
  const roomIds = (rooms ?? []).map((room) => room.id);

  const { data: reservations } = roomIds.length
    ? await supabase
        .from("reservations")
        .select(
          "id, status, room_price, created_at, decision_reason, student_profiles(full_name, email, matric_number, gender, level, department, faculty, previous_hostel), rooms(room_number, room_type, capacity), payments(id, amount_expected, payment_status, payment_reference, submitted_at, payment_proof_path, rejection_reason)"
        )
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const managerReservations = reservations ?? [];
  const params = (await searchParams) ?? {};
  const result = typeof params.result === "string" ? params.result : undefined;
  const paymentResult =
    typeof params.paymentResult === "string" ? params.paymentResult : undefined;

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-4 py-12 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm transition-colors hover:border-[#10a574]/60"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Manager dashboard
          </p>
          <h1 className="text-3xl font-bold font-display md:text-4xl">
            {hostel.name}
          </h1>
          <p className="mt-3 text-[#b8b8b8]">
            Review pending reservation applications for your assigned hostel.
          </p>
        </div>

        {result === "approved" && (
          <div className="mt-8 rounded-xl border border-[#10a574]/30 bg-[#10a574]/10 p-4 text-[#7ef1c6]">
            Reservation approved successfully.
          </div>
        )}
        {result === "rejected" && (
          <div className="mt-8 rounded-xl border border-[#d4a574]/30 bg-[#d4a574]/10 p-4 text-[#f5d5a4]">
            Reservation rejected successfully.
          </div>
        )}
        {paymentResult === "confirmed" && (
          <div className="mt-8 rounded-xl border border-[#10a574]/30 bg-[#10a574]/10 p-4 text-[#7ef1c6]">
            Payment confirmed successfully.
          </div>
        )}
        {paymentResult === "rejected" && (
          <div className="mt-8 rounded-xl border border-[#d4a574]/30 bg-[#d4a574]/10 p-4 text-[#f5d5a4]">
            Payment rejected successfully.
          </div>
        )}

        <div className="mt-8 space-y-6">
          {managerReservations.length === 0 ? (
            <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-[#b8b8b8]">
              There are no pending reservations for {hostel.name}.
            </div>
          ) : (
            managerReservations.map((reservation) => {
              const student = Array.isArray(reservation.student_profiles)
                ? reservation.student_profiles[0]
                : reservation.student_profiles;
              const room = Array.isArray(reservation.rooms)
                ? reservation.rooms[0]
                : reservation.rooms;
              const payment = Array.isArray(reservation.payments)
                ? reservation.payments[0]
                : reservation.payments;

              return (
                <article
                  key={reservation.id}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold">{student?.full_name}</h2>
                      <p className="mt-1 text-[#b8b8b8]">{student?.email}</p>
                    </div>
                    <span className="rounded-full border border-[#d4a574]/30 bg-[#d4a574]/10 px-3 py-1 text-sm text-[#f5d5a4]">
                      {reservation.status}
                    </span>
                  </div>
                  <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-[#888]">Matric number</dt><dd>{student?.matric_number}</dd></div>
                    <div><dt className="text-[#888]">Gender</dt><dd>{student?.gender}</dd></div>
                    <div><dt className="text-[#888]">Level</dt><dd>{student?.level}</dd></div>
                    <div><dt className="text-[#888]">Department</dt><dd>{student?.department}</dd></div>
                    <div><dt className="text-[#888]">Faculty</dt><dd>{student?.faculty}</dd></div>
                    <div><dt className="text-[#888]">Previous hostel</dt><dd>{student?.previous_hostel || "None"}</dd></div>
                    <div><dt className="text-[#888]">Hostel</dt><dd>{hostel.name}</dd></div>
                    <div><dt className="text-[#888]">Room</dt><dd>{room?.room_number}</dd></div>
                    <div><dt className="text-[#888]">Room type</dt><dd>{room?.room_type}</dd></div>
                    <div><dt className="text-[#888]">Capacity</dt><dd>{room?.capacity}</dd></div>
                    <div><dt className="text-[#888]">Reservation price</dt><dd>{formatCurrency(Number(reservation.room_price))}</dd></div>
                    <div><dt className="text-[#888]">Application date</dt><dd>{new Date(reservation.created_at).toLocaleDateString()}</dd></div>
                  </dl>
                  {payment && (
                    <div className="mt-6 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
                      <h3 className="font-semibold">Payment</h3>
                      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-[#888]">Amount expected</dt><dd>{formatCurrency(Number(payment.amount_expected))}</dd></div>
                        <div><dt className="text-[#888]">Status</dt><dd>{payment.payment_status}</dd></div>
                        {payment.payment_reference && <div><dt className="text-[#888]">Payment reference</dt><dd>{payment.payment_reference}</dd></div>}
                        {payment.submitted_at && <div><dt className="text-[#888]">Submitted</dt><dd>{new Date(payment.submitted_at).toLocaleString()}</dd></div>}
                      </dl>
                      {payment.payment_status === "proof_submitted" && (
                        <div className="mt-4 flex flex-wrap gap-3">
                          {payment.payment_proof_path && (
                            <Link href={`/api/manager/payments/${payment.id}/proof`} className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm text-[#7ef1c6]">
                              View payment proof
                            </Link>
                          )}
                          <form action={`/api/manager/payments/${payment.id}`} method="post">
                            <input type="hidden" name="action" value="confirm" />
                            <button className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]">Confirm Payment</button>
                          </form>
                          <form action={`/api/manager/payments/${payment.id}`} method="post" className="flex flex-wrap gap-2">
                            <input type="hidden" name="action" value="reject" />
                            <input required name="reason" placeholder="Rejection reason" className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
                            <button className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200">Reject Payment</button>
                          </form>
                        </div>
                      )}
                      {payment.payment_status === "rejected" && payment.rejection_reason && (
                        <p className="mt-3 text-sm text-red-300">Rejection reason: {payment.rejection_reason}</p>
                      )}
                    </div>
                  )}
                  {reservation.status === "pending" && <div className="mt-6 flex flex-wrap gap-3">
                    <form action={`/api/manager/reservations/${reservation.id}`} method="post">
                      <input type="hidden" name="action" value="approve" />
                      <button className="rounded-lg bg-[#10a574] px-5 py-2.5 text-sm font-semibold text-[#0f0f0f]">
                        Approve
                      </button>
                    </form>
                    <form action={`/api/manager/reservations/${reservation.id}`} method="post" className="flex flex-wrap gap-2">
                      <input type="hidden" name="action" value="reject" />
                      <input
                        name="reason"
                        placeholder="Optional rejection reason"
                        className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
                      />
                      <button className="rounded-lg border border-red-400/40 px-5 py-2.5 text-sm font-semibold text-red-200">
                        Reject
                      </button>
                    </form>
                  </div>}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
