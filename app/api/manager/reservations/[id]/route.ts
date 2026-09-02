import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getAuthorizationContext();

  if (!context || context.role !== "manager" || !context.assignedHostelId) {
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

  if (!reservation || roomRecord?.hostel_id !== context.assignedHostelId) {
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

  revalidatePath("/manager");
  return NextResponse.redirect(
    new URL(`/manager?result=${action === "approve" ? "approved" : "rejected"}`, request.url)
  );
}
