import { createClient } from "@/lib/supabase/server";
import {
  createPaymentReceiptPath,
  validatePaymentReceipt,
} from "@/lib/utils/validation";
import { NextResponse } from "next/server";

function receiptErrorResponse(request: Request, message: string) {
  const url = new URL("/dashboard/payments", request.url);
  url.searchParams.set("receiptError", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const formData = await request.formData();
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const receipt = formData.get("paymentReceipt");

  if (!paymentId || !(receipt instanceof File)) {
    return receiptErrorResponse(request, "Payment receipt is required");
  }

  const validation = await validatePaymentReceipt(receipt);
  if (!validation.valid) {
    return receiptErrorResponse(request, validation.message);
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, payment_receipt_path, reservation:reservation_id(student_profile_id)"
    )
    .eq("id", paymentId)
    .single();
  const reservation = payment?.reservation;
  const reservationRecord = Array.isArray(reservation) ? reservation[0] : reservation;

  if (
    paymentError ||
    !payment ||
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
    return receiptErrorResponse(request, "Payment record not found");
  }

  const path = createPaymentReceiptPath(user.id, paymentId, receipt);
  const { error: uploadError } = await supabase.storage
    .from("payment_receipts")
    .upload(path, await receipt.arrayBuffer(), {
      contentType: receipt.type,
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) {
    return receiptErrorResponse(request, "Failed to upload payment receipt");
  }

  const { error: updateError } = await supabase.rpc("set_student_payment_receipt", {
    p_payment_id: paymentId,
    p_path: path,
  });

  if (updateError) {
    await supabase.storage.from("payment_receipts").remove([path]);
    return receiptErrorResponse(request, updateError.message);
  }

  if (payment.payment_receipt_path) {
    const { error: cleanupError } = await supabase.storage
      .from("payment_receipts")
      .remove([payment.payment_receipt_path]);
    if (cleanupError) {
      console.error("Failed to remove replaced payment receipt", cleanupError);
    }
  }

  return NextResponse.redirect(new URL("/dashboard/payments?receipt=uploaded", request.url));
}
