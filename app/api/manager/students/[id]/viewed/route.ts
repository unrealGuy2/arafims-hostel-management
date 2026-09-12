import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const context = await getAuthorizationContext();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !context || context.mustChangePassword) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { id } = await params;
  const formData = await request.formData();
  const filter = String(formData.get("filter") ?? "unviewed");
  const search = String(formData.get("search") ?? "");
  const hostelId = String(formData.get("hostelId") ?? "");
  const { data: marked, error } = await supabase.rpc(
    "mark_student_application_viewed",
    { p_student_profile_id: id }
  );

  if (error || !marked) {
    return NextResponse.json(
      { message: "Student application not found or not authorized" },
      { status: 404 }
    );
  }

  const redirectUrl = new URL("/manager", request.url);
  redirectUrl.searchParams.set("studentFilter", filter);
  if (search) {
    redirectUrl.searchParams.set("studentSearch", search);
  }
  if (hostelId) {
    redirectUrl.searchParams.set("hostelId", hostelId);
  }
  redirectUrl.searchParams.set("viewed", "1");

  return NextResponse.redirect(redirectUrl);
}
