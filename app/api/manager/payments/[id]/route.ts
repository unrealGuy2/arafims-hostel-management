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
  const supabase = await createClient();

  const result =
    action === "confirm"
      ? await supabase.rpc("manager_confirm_payment", { p_payment_id: id })
      : action === "reject"
        ? await supabase.rpc("manager_reject_payment", {
            p_payment_id: id,
            p_rejection_reason: reason,
          })
        : { error: { message: "Invalid payment action" } };

  if (result.error) {
    return NextResponse.json({ message: result.error.message }, { status: 400 });
  }

  revalidatePath("/manager");
  return NextResponse.redirect(
    new URL(`/manager?paymentResult=${action === "confirm" ? "confirmed" : "rejected"}`, request.url)
  );
}
