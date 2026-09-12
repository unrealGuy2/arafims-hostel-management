import { createClient } from "@/lib/supabase/server";

export type AppRole = "student" | "manager" | "master_admin";

export interface AuthorizationContext {
  userId: string;
  role: AppRole;
  assignedHostelId: string | null;
  displayName: string;
  mustChangePassword: boolean;
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

  const { data: roleRecord, error: roleError } = await supabase
    .from("user_roles")
    .select("role, display_name, must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = roleRecord?.role;

  if (roleError || typeof role !== "string" || !isAppRole(role)) {
    return null;
  }
  const roleData = roleRecord;

  if (role !== "manager") {
    return {
      userId: user.id,
      role,
      assignedHostelId: null,
      displayName:
        roleData?.display_name ||
        user.user_metadata?.full_name ||
        user.email ||
        "User",
      mustChangePassword: false,
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
    displayName:
      roleData?.display_name ||
      user.user_metadata?.full_name ||
      user.email ||
      "Manager",
    mustChangePassword: Boolean(roleData?.must_change_password),
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
