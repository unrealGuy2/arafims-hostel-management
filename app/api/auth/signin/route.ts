import { createClient } from "@supabase/supabase-js";
import { validateSignIn } from "@/lib/utils/validation";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const validation = validateSignIn(body);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue: any) => {
        const path = issue.path[0] || "general";
        errors[path] = issue.message;
      });
      return NextResponse.json({ errors }, { status: 400 });
    }

    const { email, password } = validation.data;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { message: "Signin successful", user: data.user },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
