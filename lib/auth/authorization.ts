import { createClient } from "@/lib/supabase/server";

export type AppRole = "student" | "manager" | "master_admin";

export interface AuthorizationContext {
  userId: string;
  role: AppRole;
  assignedHostelId: string | null;
}

function isAppRole(value: string): value is AppRole {
  return value === "student" || value === "manager" || value === "master_admin";
}

export async function getAuthorizationContext(): Promise<AuthorizationContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");

  if (roleError || typeof role !== "string" || !isAppRole(role)) {
    return null;
  }

  if (role !== "manager") {
    return {
      userId: user.id,
      role,
      assignedHostelId: null,
    };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("hostel_managers")
    .select("hostel_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return null;
  }

  return {
    userId: user.id,
    role,
    assignedHostelId: assignment.hostel_id,
  };
}

export async function managerCanAccessHostel(hostelId: string) {
  const context = await getAuthorizationContext();

  return Boolean(
    context &&
      (context.role === "master_admin" ||
        (context.role === "manager" && context.assignedHostelId === hostelId))
  );
}
