import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const context = await getAuthorizationContext();

  if (!context || (context.role !== "manager" && context.role !== "master_admin")) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const formData = await request.formData();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const bedspaceNumber = Number(formData.get("bedspaceNumber"));
  const studentName = String(formData.get("studentName") ?? "").trim();
  const studentPhone = String(formData.get("studentPhone") ?? "").trim();

  if (!roomId || !Number.isInteger(bedspaceNumber) || !studentName || !studentPhone) {
    return NextResponse.json({ message: "All bedspace reservation fields are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("manager_create_bedspace_pre_reservation", {
    p_room_id: roomId,
    p_bedspace_number: bedspaceNumber,
    p_student_name: studentName,
    p_student_phone: studentPhone,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/manager?bedspaceResult=created", request.url));
}
