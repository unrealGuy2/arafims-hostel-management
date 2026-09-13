import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Payments | Arafims",
  description: "Manage your Arafims accommodation payments",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const params = (await searchParams) ?? {};
  const receiptResult =
    typeof params.receipt === "string" ? params.receipt : undefined;
  const receiptError =
    typeof params.receiptError === "string" ? params.receiptError : undefined;

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, status, room_price, room:room_id(room_number, room_type, hostel:hostel_id(name)), payment:payments(id, payment_status, payment_receipt_status, amount_expected, payment_reference, payment_receipt_path, rejection_reason, payment_account:payment_account_id(bank_name, account_name, account_number), receipt:payment_receipts(receipt_number))"
    )
    .eq("student_profile_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Student account
          </p>
          <h1 className="mt-2 text-3xl font-bold font-display sm:text-4xl">
            Payments
          </h1>
          <p className="mt-2 text-[#b8b8b8]">
            Submit payment proof, upload payment receipts, and access official receipts.
          </p>
        </div>

        {receiptResult === "uploaded" && (
          <p className="mb-6 rounded-xl border border-[#10a574]/40 bg-[#10251f] px-4 py-3 text-sm text-[#7ef1c6]">
            Payment receipt uploaded successfully.
          </p>
        )}
        {receiptError && (
          <p className="mb-6 rounded-xl border border-red-400/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {receiptError}
          </p>
        )}

        {reservations && reservations.length > 0 ? (
          <div className="space-y-6">
            {reservations.map((reservation) => {
              const room = Array.isArray(reservation.room)
                ? reservation.room[0]
                : reservation.room;
              const hostel = room?.hostel
                ? Array.isArray(room.hostel)
                  ? room.hostel[0]
                  : room.hostel
                : null;
              const payment = Array.isArray(reservation.payment)
                ? reservation.payment[0]
                : reservation.payment;
              const account = payment?.payment_account
                ? Array.isArray(payment.payment_account)
                  ? payment.payment_account[0]
                  : payment.payment_account
                : null;
              const receipt = payment?.receipt
                ? Array.isArray(payment.receipt)
                  ? payment.receipt[0]
                  : payment.receipt
                : null;

              return (
                <section
                  key={reservation.id}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[#b8b8b8]">{hostel?.name}</p>
                      <h2 className="mt-1 text-2xl font-bold font-display">
                        Room {room?.room_number ?? "Pending assignment"}
                      </h2>
                      <p className="mt-1 text-sm text-[#b8b8b8]">
                        Reservation status: {reservation.status}
                      </p>
                    </div>
                    {payment && (
                      <span className="rounded-full border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-1 text-xs font-medium uppercase tracking-wide">
                        {payment.payment_status === "proof_submitted"
                          ? "Awaiting verification"
                          : payment.payment_status === "confirmed"
                            ? "Confirmed"
                            : payment.payment_status}
                      </span>
                    )}
                  </div>

                  {!payment ? (
                    <p className="mt-6 text-[#b8b8b8]">
                      Payment instructions will appear after your reservation is approved.
                    </p>
                  ) : (
                    <>
                      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm text-[#888]">Amount to pay</dt>
                          <dd className="mt-1">{formatCurrency(Number(payment.amount_expected))}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-[#888]">Bank</dt>
                          <dd className="mt-1">{account?.bank_name ?? "Not available"}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-[#888]">Account name</dt>
                          <dd className="mt-1">{account?.account_name ?? "Not available"}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-[#888]">Account number</dt>
                          <dd className="mt-1">{account?.account_number ?? "Not available"}</dd>
                        </div>
                      </dl>

                      {payment.payment_reference && (
                        <p className="mt-4 text-sm text-[#b8b8b8]">
                          Payment reference: {payment.payment_reference}
                        </p>
                      )}

                      {payment.payment_status !== "confirmed" ? (
                        <p className="mt-6 text-sm text-[#b8b8b8]">
                          Receipt not yet required. Upload it after your payment is accepted.
                        </p>
                      ) : !receipt ? (
                        <p className="mt-6 text-sm text-[#b8b8b8]">
                          Your payment was accepted. The official receipt is not yet available.
                        </p>
                      ) : (
                        <div className="mt-6 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
                          <h3 className="font-semibold">Receipt Verification</h3>
                          <p className="mt-1 text-sm text-[#b8b8b8]">
                            Download the official Arafims receipt, then upload it for manager verification.
                          </p>
                          {payment.payment_receipt_status === "required" && (
                            <p className="mt-3 text-sm text-[#f5d5a4]">
                              Receipt Verification Required
                            </p>
                          )}
                          {payment.payment_receipt_status === "submitted" && (
                            <p className="mt-3 text-sm text-[#f5d5a4]">
                              Receipt submitted / awaiting manager review
                            </p>
                          )}
                          {payment.payment_receipt_status === "approved" && (
                            <p className="mt-3 text-sm text-[#7ef1c6]">Receipt approved</p>
                          )}
                          {payment.payment_receipt_status === "rejected" && (
                            <p className="mt-3 text-sm text-red-300">
                              Receipt rejected. Upload again.
                            </p>
                          )}
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Link
                              href={`/api/payments/${payment.id}/receipt`}
                              target="_blank"
                              className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]"
                            >
                              Download Receipt
                            </Link>
                            {payment.payment_receipt_path && (
                              <Link
                                href={`/api/payments/${payment.id}/uploaded-receipt`}
                                target="_blank"
                                className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#f5f5f5]"
                              >
                                View uploaded receipt
                              </Link>
                            )}
                          </div>
                          {["required", "rejected"].includes(payment.payment_receipt_status) && (
                            <form
                              action="/api/payments/receipt"
                              method="post"
                              encType="multipart/form-data"
                              className="mt-4 space-y-3"
                            >
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <input
                                required
                                name="paymentReceipt"
                                type="file"
                                accept="application/pdf,image/jpeg,image/png"
                                className="block w-full text-sm text-[#b8b8b8]"
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-[#d4a574]/60 px-4 py-2 text-sm font-semibold text-[#f5d5a4] transition-colors hover:bg-[#d4a574]/10"
                              >
                                {payment.payment_receipt_status === "rejected"
                                  ? "Replace payment receipt"
                                  : "Upload payment receipt"}
                              </button>
                            </form>
                          )}
                        </div>
                      )}

                      {payment.payment_status === "payment_pending" ||
                      payment.payment_status === "rejected" ? (
                        <form
                          action="/api/payments/proof"
                          method="post"
                          encType="multipart/form-data"
                          className="mt-6 space-y-3"
                        >
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input
                            required
                            name="paymentProof"
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            className="block w-full text-sm text-[#b8b8b8]"
                          />
                          <input
                            name="paymentReference"
                            placeholder="Payment reference (optional)"
                            className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
                          />
                          {payment.payment_status === "rejected" &&
                            payment.rejection_reason && (
                              <p className="text-sm text-red-300">
                                Rejected: {payment.rejection_reason}
                              </p>
                            )}
                          <button
                            type="submit"
                            className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c]"
                          >
                            Submit payment proof
                          </button>
                        </form>
                      ) : payment.payment_status === "proof_submitted" ? (
                        <p className="mt-6 text-sm text-[#f5d5a4]">
                          Payment is only confirmed after manager verification.
                        </p>
                      ) : null}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <section className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
            <p className="text-[#b8b8b8]">
              Payment instructions will appear after your reservation is approved.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
