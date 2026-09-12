import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { passwordSchema } from "@/lib/utils/validation";

export async function POST(request: Request) {
  const context = await getAuthorizationContext();

  if (!context || (context.role !== "manager" && context.role !== "master_admin")) {
    return NextResponse.json({ message: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ message: "Current password is required" }, { status: 400 });
  }

  const validation = passwordSchema.safeParse(newPassword);
  if (!validation.success) {
    return NextResponse.json(
      { message: validation.error.issues[0]?.message ?? "New password is invalid" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const { error: passwordError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (passwordError) {
    return NextResponse.json({ message: "Current password is incorrect" }, { status: 400 });
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: validation.data,
  });

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 400 });
  }

  const { error: requirementError } = await supabase.rpc(
    "clear_temporary_password_requirement"
  );
  if (requirementError) {
    return NextResponse.json({ message: requirementError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Password changed successfully" });
}
