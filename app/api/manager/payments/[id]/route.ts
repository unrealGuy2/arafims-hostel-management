import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(
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
  const formData = await request.formData();
  const action = formData.get("action");
  const reason = String(formData.get("reason") ?? "").trim();
  const redirectTo =
    formData.get("redirectTo") === "/owner/payments"
      ? "/owner/payments"
      : null;
  const supabase = await createClient();

  const result =
    action === "confirm"
      ? await supabase.rpc("manager_confirm_payment", { p_payment_id: id })
      : action === "reject"
        ? await supabase.rpc("manager_reject_payment", {
            p_payment_id: id,
            p_rejection_reason: reason,
          })
        : action === "approve_receipt"
          ? await supabase.rpc("manager_review_payment_receipt", {
              p_payment_id: id,
              p_action: "approve",
            })
          : action === "reject_receipt"
            ? await supabase.rpc("manager_review_payment_receipt", {
                p_payment_id: id,
                p_action: "reject",
              })
        : { error: { message: "Invalid payment action" } };

  if (result.error) {
    return NextResponse.json({ message: result.error.message }, { status: 400 });
  }

  revalidatePath("/manager");
  revalidatePath("/manager/payments");
  const redirectPath =
    redirectTo ??
    (action === "approve_receipt" || action === "reject_receipt"
      ? "/manager/payments"
      : `/manager?paymentResult=${action === "confirm" ? "confirmed" : "rejected"}`);
  if (redirectTo) {
    revalidatePath("/owner/payments");
  }
  return NextResponse.redirect(new URL(redirectPath, request.url));
}
