import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

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
  const paymentProof = formData.get("paymentProof");
  const paymentReference = String(formData.get("paymentReference") ?? "").trim();

  if (!paymentId || !(paymentProof instanceof File)) {
    return NextResponse.json({ message: "Payment proof is required" }, { status: 400 });
  }

  if (paymentProof.size === 0 || paymentProof.size > MAX_FILE_SIZE) {
    return NextResponse.json({ message: "Payment proof must be less than 5MB" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(paymentProof.type)) {
    return NextResponse.json(
      { message: "Payment proof must be a PDF, JPG, PNG, or WEBP file" },
      { status: 400 }
    );
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, payment_status, reservation:reservation_id(student_profile_id)")
    .eq("id", paymentId)
    .single();
  const reservation = payment?.reservation;
  const reservationRecord = Array.isArray(reservation) ? reservation[0] : reservation;

  if (
    paymentError ||
    !payment ||
    !reservationRecord ||
    !(await supabase
      .from("student_profiles")
      .select("id")
      .eq("id", reservationRecord.student_profile_id)
      .eq("user_id", user.id)
      .maybeSingle()).data
  ) {
    return NextResponse.json({ message: "Payment record not found" }, { status: 404 });
  }

  if (!["payment_pending", "rejected"].includes(payment.payment_status)) {
    return NextResponse.json({ message: "This payment is not accepting a new proof" }, { status: 400 });
  }

  const extension = paymentProof.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${user.id}/${paymentId}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("payment_proofs")
    .upload(path, await paymentProof.arrayBuffer(), {
      contentType: paymentProof.type,
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ message: "Failed to upload payment proof" }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("payments")
    .update({
      payment_status: "proof_submitted",
      payment_proof_path: path,
      payment_reference: paymentReference || null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (updateError) {
    await supabase.storage.from("payment_proofs").remove([path]);
    return NextResponse.json({ message: updateError.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/dashboard?payment=submitted", request.url));
}
