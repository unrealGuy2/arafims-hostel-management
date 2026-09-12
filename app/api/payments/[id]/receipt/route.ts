import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { NextResponse } from "next/server";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getAuthorizationContext();
  if (!context || context.mustChangePassword) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, payment_status, reservation:reservation_id(student_profile_id, room:room_id(hostel_id)), receipt:payment_receipts(*)"
    )
    .eq("id", id)
    .single();
  const reservation = payment?.reservation;
  const reservationRecord = Array.isArray(reservation) ? reservation[0] : reservation;
  const receipt = Array.isArray(payment?.receipt) ? payment.receipt[0] : payment?.receipt;
  const room = reservationRecord?.room;
  const roomRecord = Array.isArray(room) ? room[0] : room;
  const studentOwnsPayment =
    context.role === "student" &&
    Boolean(
      reservationRecord &&
        (
          await supabase
            .from("student_profiles")
            .select("id")
            .eq("id", reservationRecord.student_profile_id)
            .eq("user_id", context.userId)
            .maybeSingle()
        ).data
    );
  const managerCanAccessPayment =
    context.role === "master_admin" ||
    (context.role === "manager" &&
      Boolean(context.assignedHostelId) &&
      roomRecord?.hostel_id === context.assignedHostelId);

  if (
    paymentError ||
    !payment ||
    payment.payment_status !== "confirmed" ||
    !reservationRecord ||
    !receipt ||
    (!studentOwnsPayment && !managerCanAccessPayment)
  ) {
    return NextResponse.json({ message: "Receipt not found" }, { status: 404 });
  }

  const fields = {
    receipt_number: escapeHtml(receipt.receipt_number),
    receipt_date: escapeHtml(new Date(receipt.receipt_date).toLocaleString()),
    student_full_name: escapeHtml(receipt.student_full_name),
    matric_number: escapeHtml(receipt.matric_number),
    email: escapeHtml(receipt.email),
    level: escapeHtml(String(receipt.level)),
    department: escapeHtml(receipt.department),
    faculty: escapeHtml(receipt.faculty),
    gender: escapeHtml(receipt.gender),
    hostel_name: escapeHtml(receipt.hostel_name),
    room_number: escapeHtml(receipt.room_number),
    room_type: escapeHtml(receipt.room_type),
    amount_paid: escapeHtml(
      new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        minimumFractionDigits: 2,
      }).format(Number(receipt.amount_paid))
    ),
    payment_method: escapeHtml(receipt.payment_method),
    payment_reference: escapeHtml(receipt.payment_reference || "Not provided"),
    payment_status: escapeHtml(receipt.payment_status.toUpperCase()),
    verified_at: escapeHtml(new Date(receipt.verified_at).toLocaleString()),
    verified_by: escapeHtml(receipt.verified_by),
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fields.receipt_number} - Official Payment Receipt</title>
<style>
body{font-family:Arial,sans-serif;color:#17202a;margin:0;background:#f4f6f7}
.receipt{max-width:800px;margin:32px auto;background:#fff;padding:44px;box-shadow:0 2px 12px #0002}
h1{text-align:center;font-size:24px;margin:0 0 32px}
.meta{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #d9dee2;padding-bottom:16px;margin-bottom:24px}
dl{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 28px}
dt{font-size:12px;color:#65727e;text-transform:uppercase}dd{margin:3px 0 0;font-size:15px;overflow-wrap:anywhere}
.amount{margin-top:28px;padding:18px;background:#eef8f4;border:1px solid #b8e5d2;font-size:20px;font-weight:bold}
.status{color:#087443;font-weight:bold}.footer{margin-top:36px;padding-top:16px;border-top:1px solid #d9dee2;font-size:12px;color:#65727e}
@media (max-width:600px){body{background:#fff}.receipt{margin:0;padding:24px 16px;box-shadow:none}h1{font-size:20px;line-height:1.3}.meta{flex-direction:column;align-items:flex-start}dl{grid-template-columns:1fr}}
@media print{body{background:#fff}.receipt{margin:0;box-shadow:none;max-width:none}}
</style>
</head>
<body><main class="receipt">
<h1>${fields.hostel_name} — OFFICIAL PAYMENT RECEIPT</h1>
<div class="meta"><span><strong>Receipt:</strong> ${fields.receipt_number}</span><span><strong>Date:</strong> ${fields.receipt_date}</span></div>
<dl>
<div><dt>Student name</dt><dd>${fields.student_full_name}</dd></div>
<div><dt>Matric number</dt><dd>${fields.matric_number}</dd></div>
<div><dt>Email</dt><dd>${fields.email}</dd></div>
<div><dt>Level</dt><dd>${fields.level}</dd></div>
<div><dt>Department</dt><dd>${fields.department}</dd></div>
<div><dt>Faculty</dt><dd>${fields.faculty}</dd></div>
<div><dt>Gender</dt><dd>${fields.gender}</dd></div>
<div><dt>Hostel</dt><dd>${fields.hostel_name}</dd></div>
<div><dt>Room</dt><dd>${fields.room_number}</dd></div>
<div><dt>Room type</dt><dd>${fields.room_type}</dd></div>
<div><dt>Payment method</dt><dd>${fields.payment_method}</dd></div>
<div><dt>Payment reference</dt><dd>${fields.payment_reference}</dd></div>
<div><dt>Verified date</dt><dd>${fields.verified_at}</dd></div>
<div><dt>Verifier</dt><dd>${fields.verified_by}</dd></div>
</dl>
<div class="amount">Amount paid: ${fields.amount_paid}</div>
<p class="status">Payment status: ${fields.payment_status}</p>
<p class="footer">This is an official payment receipt generated after payment verification.</p>
</main></body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${receipt.receipt_number}.html"`,
    },
  });
}
