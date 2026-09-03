import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getAuthorizationContext();

  if (!context || (context.role !== "manager" && context.role !== "master_admin")) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { id } = await params;
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const supabase = await createClient();
  let error;

  if (action === "release") {
    ({ error } = await supabase.rpc("manager_release_bedspace_pre_reservation", { p_id: id }));
  } else if (action === "link") {
    const studentProfileId = String(formData.get("studentProfileId") ?? "").trim();
    ({ error } = await supabase.rpc("manager_link_bedspace_pre_reservation", {
      p_id: id,
      p_student_profile_id: studentProfileId,
    }));
  } else if (action === "update") {
    ({ error } = await supabase.rpc("manager_update_bedspace_pre_reservation", {
      p_id: id,
      p_student_name: String(formData.get("studentName") ?? "").trim(),
      p_student_phone: String(formData.get("studentPhone") ?? "").trim(),
    }));
  } else {
    return NextResponse.json({ message: "Invalid bedspace reservation action" }, { status: 400 });
  }

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/manager?bedspaceResult=updated", request.url));
}
