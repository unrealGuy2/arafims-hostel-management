import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getAuthorizationContext();

  if (
    !context ||
    context.mustChangePassword ||
    (context.role !== "manager" && context.role !== "master_admin") ||
    (context.role === "manager" && !context.assignedHostelId)
  ) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("payment_status, payment_receipt_path, reservation:reservation_id(room:room_id(hostel_id))")
    .eq("id", id)
    .single();
  const reservation = payment?.reservation;
  const reservationRecord = Array.isArray(reservation) ? reservation[0] : reservation;
  const room = reservationRecord?.room;
  const roomRecord = Array.isArray(room) ? room[0] : room;

  if (
    error ||
    payment?.payment_status !== "confirmed" ||
    !payment?.payment_receipt_path ||
    context.role === "manager" &&
    roomRecord?.hostel_id !== context.assignedHostelId
  ) {
    return NextResponse.json({ message: "Payment receipt not found" }, { status: 404 });
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from("payment_receipts")
    .createSignedUrl(payment.payment_receipt_path, 300);

  if (signedUrlError || !signedUrl?.signedUrl) {
    return NextResponse.json({ message: "Unable to open payment receipt" }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl.signedUrl);
}
