import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { id } = await params;
  const { data: payment, error } = await supabase
    .from("payments")
    .select("payment_receipt_path, reservation:reservation_id(student_profile_id)")
    .eq("id", id)
    .single();
  const reservation = payment?.reservation;
  const reservationRecord = Array.isArray(reservation) ? reservation[0] : reservation;

  if (
    error ||
    !payment?.payment_receipt_path ||
    !reservationRecord ||
    !(
      await supabase
        .from("student_profiles")
        .select("id")
        .eq("id", reservationRecord.student_profile_id)
        .eq("user_id", user.id)
        .maybeSingle()
    ).data
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
