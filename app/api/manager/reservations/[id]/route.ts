import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getAuthorizationContext();

  if (
    !context ||
    (context.role !== "manager" && context.role !== "master_admin") ||
    context.mustChangePassword ||
    (context.role === "manager" && !context.assignedHostelId)
  ) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { id } = await params;
  const formData = await request.formData();
  const action = formData.get("action");
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, room:room_id(hostel_id)")
    .eq("id", id)
    .single();
  const room = reservation?.room;
  const roomRecord = Array.isArray(room) ? room[0] : room;

  if (
    !reservation ||
    (context.role === "manager" && roomRecord?.hostel_id !== context.assignedHostelId)
  ) {
    return NextResponse.json({ message: "Not authorized" }, { status: 403 });
  }

  const rpc =
    action === "approve"
      ? supabase.rpc("approve_reservation", { p_reservation_id: id })
      : action === "reject"
        ? supabase.rpc("reject_reservation", {
            p_reservation_id: id,
            p_reason: reason || null,
          })
        : null;

  if (!rpc) {
    return NextResponse.json({ message: "Invalid reservation action" }, { status: 400 });
  }

  const { error } = await rpc;

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  try {
    const { data: decisionDetails, error: decisionDetailsError } = await supabase
      .from("reservations")
      .select(
        "room_price, student_profiles(full_name, email), rooms(room_number, hostels(name))"
      )
      .eq("id", id)
      .single();

    if (decisionDetailsError || !decisionDetails) {
      throw decisionDetailsError ?? new Error("Reservation details not found");
    }

    const student = Array.isArray(decisionDetails.student_profiles)
      ? decisionDetails.student_profiles[0]
      : decisionDetails.student_profiles;
    const room = Array.isArray(decisionDetails.rooms)
      ? decisionDetails.rooms[0]
      : decisionDetails.rooms;
    const hostel = room
      ? Array.isArray(room.hostels)
        ? room.hostels[0]
        : room.hostels
      : null;

    if (!student?.email || !student.full_name || !room?.room_number || !hostel?.name) {
      throw new Error("Incomplete reservation notification details");
    }

    const studentName = escapeHtml(student.full_name);
    const hostelName = escapeHtml(hostel.name);
    const roomNumber = escapeHtml(room.room_number);

    if (action === "approve") {
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select(
          "payment_account:payment_account_id(bank_name, account_name, account_number)"
        )
        .eq("reservation_id", id)
        .single();

      if (paymentError || !payment) {
        throw paymentError ?? new Error("Payment details not found");
      }

      const paymentAccount = Array.isArray(payment.payment_account)
        ? payment.payment_account[0]
        : payment.payment_account;

      if (
        !paymentAccount?.bank_name ||
        !paymentAccount.account_name ||
        !paymentAccount.account_number
      ) {
        throw new Error("Incomplete payment account notification details");
      }

      await sendEmail({
        to: student.email,
        subject: "Your hostel reservation has been approved",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
            <h1 style="color:#10a574">Reservation Approved</h1>
            <p>Hello ${studentName},</p>
            <p>Your reservation application has been approved.</p>
            <p><strong>Hostel:</strong> ${hostelName}<br><strong>Room:</strong> ${roomNumber}<br><strong>Room price:</strong> ₦${Number(decisionDetails.room_price).toLocaleString("en-NG")}</p>
            <h2>Payment instructions</h2>
            <p><strong>Bank:</strong> ${escapeHtml(paymentAccount.bank_name)}<br><strong>Account name:</strong> ${escapeHtml(paymentAccount.account_name)}<br><strong>Account number:</strong> ${escapeHtml(paymentAccount.account_number)}</p>
            <p>After payment, submit your payment proof through the student dashboard.</p>
          </div>
        `,
      });
    } else {
      await sendEmail({
        to: student.email,
        subject: "Update on your hostel reservation application",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
            <h1 style="color:#b44">Reservation Rejected</h1>
            <p>Hello ${studentName},</p>
            <p>Your hostel reservation application has been rejected.</p>
            <p><strong>Hostel:</strong> ${hostelName}<br><strong>Room:</strong> ${roomNumber}</p>
            ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
          </div>
        `,
      });
    }
  } catch (notificationError) {
    console.error("Reservation decision email failed", notificationError);
  }

  revalidatePath("/manager");
  return NextResponse.redirect(
    new URL(`/manager?result=${action === "approve" ? "approved" : "rejected"}`, request.url)
  );
}
