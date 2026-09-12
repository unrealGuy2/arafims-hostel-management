import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/manager",
    "/manager/:path*",
    "/owner",
  ],
};

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  await refreshSupabaseSession(request, response);
  return response;
}
